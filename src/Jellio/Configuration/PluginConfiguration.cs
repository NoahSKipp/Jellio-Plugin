using MediaBrowser.Model.Plugins;

namespace Jellio.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Master switch. Disabling this restores the stock web client on next start.</summary>
    public bool EnableReskin { get; set; } = true;

    // Server wide, admin controlled, applies to every user: this whole
    // block is Jellio's own server side config for
    // Frontend/components/seasonalEffects.js's own overlay, the same
    // real thing per user customization would need to layer on top of
    // later, not something to invent a second config surface for now.
    // Flat properties throughout, the same convention every other real
    // Jellyfin plugin config already confirmed against in this codebase
    // (Gelato's own CatalogConfig, CodeDevMLH/Jellyfin-Seasonals' own
    // PluginConfiguration.cs) uses rather than a nested class, since
    // BasePluginConfiguration's own real XmlSerializer has no real
    // reason here to need one. Date ranges default to that same real
    // Seasonals plugin's own real default schedule (this codebase's own
    // Frontend/components/seasonalEffects.js already ported those once
    // for its own now removed client only defaults, same real numbers
    // here instead).
    public bool SeasonalEffectsEnabled { get; set; } = true;

    public bool SeasonalWinterEnabled { get; set; } = true;
    public int SeasonalWinterStartMonth { get; set; } = 12;
    public int SeasonalWinterStartDay { get; set; } = 1;
    public int SeasonalWinterEndMonth { get; set; } = 2;
    public int SeasonalWinterEndDay { get; set; } = 29;

    public bool SeasonalSpringEnabled { get; set; } = true;
    public int SeasonalSpringStartMonth { get; set; } = 3;
    public int SeasonalSpringStartDay { get; set; } = 1;
    public int SeasonalSpringEndMonth { get; set; } = 5;
    public int SeasonalSpringEndDay { get; set; } = 31;

    public bool SeasonalSummerEnabled { get; set; } = true;
    public int SeasonalSummerStartMonth { get; set; } = 6;
    public int SeasonalSummerStartDay { get; set; } = 1;
    public int SeasonalSummerEndMonth { get; set; } = 8;
    public int SeasonalSummerEndDay { get; set; } = 31;

    public bool SeasonalAutumnEnabled { get; set; } = true;
    public int SeasonalAutumnStartMonth { get; set; } = 9;
    public int SeasonalAutumnStartDay { get; set; } = 1;
    public int SeasonalAutumnEndMonth { get; set; } = 11;
    public int SeasonalAutumnEndDay { get; set; } = 30;

    public bool SeasonalHalloweenEnabled { get; set; } = true;
    public int SeasonalHalloweenStartMonth { get; set; } = 10;
    public int SeasonalHalloweenStartDay { get; set; } = 24;
    public int SeasonalHalloweenEndMonth { get; set; } = 11;
    public int SeasonalHalloweenEndDay { get; set; } = 5;

    public bool SeasonalNewYearEnabled { get; set; } = true;
    public int SeasonalNewYearStartMonth { get; set; } = 12;
    public int SeasonalNewYearStartDay { get; set; } = 28;
    public int SeasonalNewYearEndMonth { get; set; } = 1;
    public int SeasonalNewYearEndDay { get; set; } = 5;

    // No real date range: Frontend/components/seasonalEffects.js's own
    // isFriday13() checks the calendar directly (day 13, a real Friday),
    // the one theme here that was never a fixed window to begin with.
    public bool SeasonalFriday13Enabled { get; set; } = true;
}
