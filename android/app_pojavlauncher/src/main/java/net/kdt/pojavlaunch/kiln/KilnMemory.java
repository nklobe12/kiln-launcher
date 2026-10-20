package net.kdt.pojavlaunch.kiln;

import android.content.Context;

import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.prefs.LauncherPreferences;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Decides how much heap Java gets.
 *
 * Amethyst always uses its own memory slider and drops any -Xmx a profile
 * passes. Kiln writes -Xmx into a profile's Java arguments when the profile
 * (or the modpack it came from) asks for more memory, so big modpacks don't
 * crawl or stall at the 2 GB default. This class honours that request:
 * it can raise memory above the slider, never lowers it, and never goes past
 * what the phone can spare.
 */
public final class KilnMemory {
    private static final Pattern XMX = Pattern.compile("(?:^|\\s)-Xmx(\\d{1,9})([kKmMgG]?)(?=\\s|$)");

    private KilnMemory() {}

    /** Heap size the Java arguments ask for, in MB, or 0 if they don't set one. */
    public static int requestedMb(String javaArgs) {
        if (javaArgs == null) return 0;
        Matcher m = XMX.matcher(javaArgs);
        long mb = 0;
        while (m.find()) {
            long value = Long.parseLong(m.group(1));
            switch (m.group(2).toLowerCase(Locale.ROOT)) {
                case "g": mb = value * 1024; break;
                case "m": mb = value; break;
                case "k": mb = value / 1024; break;
                default: mb = value / (1024 * 1024); break;
            }
        }
        return (int) Math.min(mb, Integer.MAX_VALUE);
    }

    /** Most heap Kiln will give Java on this phone, in MB. Leaves room for Android and the graphics driver. */
    public static int ceilingMb(Context ctx) {
        int total = Tools.getTotalDeviceMemory(ctx);
        int ceiling = Math.min((int) (total * 0.6), total - 3072);
        return Math.max(ceiling, LauncherPreferences.PREF_RAM_ALLOCATION);
    }

    /** Heap to launch with, in MB: the launcher's setting, raised to the profile's request up to the ceiling. */
    public static int effectiveMb(Context ctx, String javaArgs) {
        int base = LauncherPreferences.PREF_RAM_ALLOCATION;
        int requested = requestedMb(javaArgs);
        if (requested <= base) return base;
        return Math.max(base, Math.min(requested, ceilingMb(ctx)));
    }
}
