package app.mantralayayatra.db;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

/**
 * Opens the app's SQLite file. The schema itself is created and migrated by the web app
 * (src/app/core/store/sqlite-store.ts), so this only opens the file and turns on WAL.
 */
public final class AppDatabaseHelper extends SQLiteOpenHelper {

    private static final String FILE = "mantralaya-yatra.db";
    private static final int VERSION = 1;

    private static volatile AppDatabaseHelper instance;

    public static AppDatabaseHelper get(Context context) {
        if (instance == null) {
            synchronized (AppDatabaseHelper.class) {
                if (instance == null) {
                    instance = new AppDatabaseHelper(context.getApplicationContext());
                }
            }
        }
        return instance;
    }

    private AppDatabaseHelper(Context context) {
        super(context, FILE, null, VERSION);
        setWriteAheadLoggingEnabled(true);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        // Tables come from the web app's migrations.
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Schema changes are the web app's migrations, not SQLiteOpenHelper versions.
    }
}
