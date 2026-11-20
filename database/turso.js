/**
 * ============================================================
 * Turso Cloud Database Adapter for New Tech Medical Corp
 * ============================================================
 * 
 * Drop-in replacement for the sql.js wrapper in schema.js.
 * Exposes the SAME synchronous-style interface:
 *   db.prepare(sql).run(...args)   → returns { lastInsertRowid }
 *   db.prepare(sql).get(...args)   → returns object | null
 *   db.prepare(sql).all(...args)   → returns array of objects
 *   db.exec(sql)                   → void
 *   db.save()                      → no-op (Turso persists automatically)
 *   db.pragma()                    → no-op
 *
 * KEY DIFFERENCE: All .run(), .get(), .all() return Promises.
 * Route handlers MUST use async/await.
 *
 * Uses @libsql/client for Turso connectivity.
 * Reads TURSO_DATABASE_URL and TURSO_AUTH_TOKEN from env vars.
 */

var { createClient } = require('@libsql/client');
var fs = require('fs');
var path = require('path');

// Auto-load .env file if present in workspace root
(function loadEnv() {
  try {
    var envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      var lines = fs.readFileSync(envPath, 'utf8').split('\n');
      lines.forEach(function (line) {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        var idx = line.indexOf('=');
        if (idx > 0) {
          var key = line.substring(0, idx).trim();
          var val = line.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) process.env[key] = val;
        }
      });
    }
  } catch (e) { }
})();

var _client = null;

function getClient() {
  if (_client) return _client;

  var url = process.env.TURSO_DATABASE_URL;
  var authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error('[Turso] TURSO_DATABASE_URL is not set in environment variables');
  }

  _client = createClient({
    url: url,
    authToken: authToken || undefined
  });

  return _client;
}

/**
 * Convert libsql result rows to plain objects.
 * libsql returns { columns: [...], rows: [...] } where each row is an array.
 * But with the newer client, rows are already objects. Handle both.
 */
function rowToObject(row, columns) {
  if (!row) return null;
  // If row is already a plain object (newer client versions)
  if (!Array.isArray(row) && typeof row === 'object') {
    // Convert BigInt values to Number
    var obj = {};
    for (var key in row) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        obj[key] = typeof row[key] === 'bigint' ? Number(row[key]) : row[key];
      }
    }
    return obj;
  }
  // Array-style row with columns
  if (Array.isArray(row) && columns) {
    var result = {};
    for (var i = 0; i < columns.length; i++) {
      result[columns[i]] = typeof row[i] === 'bigint' ? Number(row[i]) : row[i];
    }
    return result;
  }
  return row;
}

function convertRows(result) {
  if (!result || !result.rows) return [];
  return result.rows.map(function (row) {
    return rowToObject(row, result.columns);
  });
}

/**
 * Normalize SQL parameter placeholders.
 * sql.js uses `?` positional params with array args.
 * @libsql/client also supports `?` positional params.
 * This function ensures args are in the correct format.
 */
function normalizeArgs(args) {
  if (!args || args.length === 0) return [];
  // Flatten if single array argument was passed
  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0];
  }
  // Convert undefined to null for Turso compatibility
  return args.map(function (a) {
    if (a === undefined) return null;
    return a;
  });
}

/**
 * Create Turso-backed database wrapper with sql.js-compatible interface.
 */
function createTursoWrapper(customClient) {
  var client = customClient || getClient();

  var wrapper = {
    _raw: client,

    /**
     * No-op: Turso persists automatically, no manual save needed.
     */
    save: function () { },

    /**
     * No-op: PRAGMA commands are not supported by Turso in the same way.
     */
    pragma: function () { },

    /**
     * Execute raw SQL (DDL or statements without return value).
     * Returns a Promise.
     */
    exec: function (sql) {
      return client.execute(sql).catch(function (err) {
        // Gracefully ignore idempotent errors (like duplicate column or table already exists)
        if (err && err.message && (
          err.message.includes('duplicate column name') ||
          err.message.includes('already exists') ||
          err.message.includes('table') && err.message.includes('exists')
        )) {
          return { rowsAffected: 0, rows: [] };
        }
        throw err;
      });
    },

    /**
     * Prepare a statement with run/get/all methods.
     * All methods return Promises (unlike sync sql.js wrapper).
     */
    prepare: function (sql) {
      return {
        /**
         * Execute INSERT/UPDATE/DELETE.
         * Returns Promise<{ lastInsertRowid: number }>
         */
        run: function () {
          var args = normalizeArgs(Array.prototype.slice.call(arguments));
          return client.execute({ sql: sql, args: args }).then(function (result) {
            return {
              lastInsertRowid: result.lastInsertRowid !== undefined
                ? Number(result.lastInsertRowid)
                : 0,
              changes: result.rowsAffected || 0
            };
          });
        },

        /**
         * Execute SELECT and return first row or null.
         * Returns Promise<object|null>
         */
        get: function () {
          var args = normalizeArgs(Array.prototype.slice.call(arguments));
          return client.execute({ sql: sql, args: args }).then(function (result) {
            var rows = convertRows(result);
            return rows.length > 0 ? rows[0] : null;
          });
        },

        /**
         * Execute SELECT and return all rows.
         * Returns Promise<array>
         * Also supports `.all.apply(null, params)` pattern used in routes.
         */
        all: function () {
          var args = normalizeArgs(Array.prototype.slice.call(arguments));
          return client.execute({ sql: sql, args: args }).then(function (result) {
            return convertRows(result);
          });
        }
      };
    },

    /**
     * Execute a batch of SQL statements atomically (transaction).
     * @param {Array<{sql: string, args?: Array}>} statements
     * @returns Promise
     */
    batch: function (statements) {
      return client.batch(statements, 'write');
    },

    /**
     * Execute a function inside a transaction.
     * @param {Function} fn - async function receiving a transaction client
     * @returns Promise
     */
    transaction: function (fn) {
      return client.transaction('write').then(function (tx) {
        // Wrap tx with the same interface
        var txWrapper = {
          prepare: function (sql) {
            return {
              run: function () {
                var args = normalizeArgs(Array.prototype.slice.call(arguments));
                return tx.execute({ sql: sql, args: args }).then(function (result) {
                  return {
                    lastInsertRowid: result.lastInsertRowid !== undefined
                      ? Number(result.lastInsertRowid)
                      : 0,
                    changes: result.rowsAffected || 0
                  };
                });
              },
              get: function () {
                var args = normalizeArgs(Array.prototype.slice.call(arguments));
                return tx.execute({ sql: sql, args: args }).then(function (result) {
                  var rows = convertRows(result);
                  return rows.length > 0 ? rows[0] : null;
                });
              },
              all: function () {
                var args = normalizeArgs(Array.prototype.slice.call(arguments));
                return tx.execute({ sql: sql, args: args }).then(function (result) {
                  return convertRows(result);
                });
              }
            };
          },
          exec: function (sql) {
            return tx.execute(sql);
          },
          commit: function () { return tx.commit(); },
          rollback: function () { return tx.rollback(); }
        };

        return fn(txWrapper)
          .then(function (result) {
            return tx.commit().then(function () { return result; });
          })
          .catch(function (err) {
            return tx.rollback().then(function () { throw err; });
          });
      });
    },

    /**
     * Close the client connection.
     */
    close: function () {
      if (_client) {
        _client.close();
        _client = null;
      }
    }
  };

  return wrapper;
}

/**
 * Get a Turso database wrapper (singleton pattern).
 * This replaces getDatabase() from schema.js.
 * Returns a Promise that resolves to the wrapper.
 */
function getTursoDatabase() {
  var db = createTursoWrapper();
  // Test connection
  return db.prepare('SELECT 1 as test').get().then(function (row) {
    if (row && row.test === 1) {
      console.log('[Turso] Database connection established successfully');
    }
    return db;
  });
}

module.exports = {
  createTursoWrapper: createTursoWrapper,
  getTursoDatabase: getTursoDatabase,
  getClient: getClient
};
