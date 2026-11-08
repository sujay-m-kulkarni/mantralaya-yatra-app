package app.mantralayayatra.db;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * A thin SQL bridge to the app's SQLite database, copied from Money Trail. The schema and every
 * query live in the web app (src/app/core/store/sqlite-store.ts); this class only runs them.
 */
@CapacitorPlugin(name = "AppDatabase")
public class DatabasePlugin extends Plugin {

    /** Runs one SELECT and returns its rows as objects keyed by column name. */
    @PluginMethod
    public void query(PluginCall call) {
        String sql = call.getString("sql");
        if (sql == null) {
            call.reject("sql is required");
            return;
        }
        try {
            String[] args = toStringArgs(call.getArray("args", new JSArray()));
            JSArray rows = new JSArray();
            try (Cursor cursor = db().rawQuery(sql, args)) {
                String[] names = cursor.getColumnNames();
                while (cursor.moveToNext()) {
                    JSObject row = new JSObject();
                    for (int i = 0; i < names.length; i++) {
                        switch (cursor.getType(i)) {
                            case Cursor.FIELD_TYPE_NULL:
                                row.put(names[i], JSONObject.NULL);
                                break;
                            case Cursor.FIELD_TYPE_INTEGER:
                                row.put(names[i], cursor.getLong(i));
                                break;
                            case Cursor.FIELD_TYPE_FLOAT:
                                row.put(names[i], cursor.getDouble(i));
                                break;
                            case Cursor.FIELD_TYPE_BLOB:
                                // The app stores no binary data.
                                break;
                            default:
                                row.put(names[i], cursor.getString(i));
                                break;
                        }
                    }
                    rows.put(row);
                }
            }
            JSObject result = new JSObject();
            result.put("rows", rows);
            call.resolve(result);
        } catch (JSONException | RuntimeException e) {
            call.reject("Query failed: " + e.getMessage(), e);
        }
    }

    /** Runs a list of statements in one transaction: all are applied, or none. */
    @PluginMethod
    public void execute(PluginCall call) {
        JSArray statements = call.getArray("statements");
        if (statements == null) {
            call.reject("statements is required");
            return;
        }
        SQLiteDatabase db = db();
        boolean committed = false;
        db.beginTransaction();
        try {
            for (int i = 0; i < statements.length(); i++) {
                JSONObject statement = statements.getJSONObject(i);
                String sql = statement.getString("sql");
                JSONArray args = statement.optJSONArray("args");
                if (args == null || args.length() == 0) {
                    db.execSQL(sql);
                } else {
                    db.execSQL(sql, toBindArgs(args));
                }
            }
            db.setTransactionSuccessful();
            committed = true;
        } catch (JSONException | RuntimeException e) {
            call.reject("Statement failed: " + e.getMessage(), e);
        } finally {
            db.endTransaction();
        }
        if (committed) {
            call.resolve();
        }
    }

    private SQLiteDatabase db() {
        return AppDatabaseHelper.get(getContext()).getWritableDatabase();
    }

    private static String[] toStringArgs(JSONArray args) throws JSONException {
        String[] out = new String[args.length()];
        for (int i = 0; i < args.length(); i++) {
            out[i] = args.isNull(i) ? null : String.valueOf(args.get(i));
        }
        return out;
    }

    private static Object[] toBindArgs(JSONArray args) throws JSONException {
        Object[] out = new Object[args.length()];
        for (int i = 0; i < args.length(); i++) {
            Object value = args.isNull(i) ? null : args.get(i);
            if (value instanceof Boolean) {
                out[i] = ((Boolean) value) ? 1L : 0L;
            } else if (value instanceof Integer) {
                out[i] = ((Integer) value).longValue();
            } else if (value instanceof Long || value instanceof Double || value instanceof String || value == null) {
                out[i] = value;
            } else if (value instanceof Number) {
                out[i] = ((Number) value).doubleValue();
            } else {
                out[i] = String.valueOf(value);
            }
        }
        return out;
    }
}
