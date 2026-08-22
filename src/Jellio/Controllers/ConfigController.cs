using Jellio.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellio.Controllers;

/// <summary>
/// Server side, admin controlled config every Jellio client reads,
/// starting with Frontend/components/seasonalEffects.js's own overlay:
/// one real shared source instead of the client only localStorage
/// toggles this used to carry, so a setting here already applies to
/// every user and, down the line, to any other real client of this
/// same server (an Android TV client included) the same way Moonfin's
/// own server plugin already serves one shared settings surface to
/// every one of its own real clients, confirmed against that project's
/// own source before writing this rather than guessed. Authenticated
/// like every other controller in this codebase; nothing here is
/// secret, but there is no real reason for an unauthenticated request
/// to reach it either.
/// </summary>
[ApiController]
[Route("Jellio/config")]
[Authorize]
public class ConfigController : ControllerBase
{
    public record SeasonalRange(int StartMonth, int StartDay, int EndMonth, int EndDay);

    public record SeasonalEffectConfig(bool Enabled, SeasonalRange? Range);

    public record ClientConfig(bool SeasonalEffectsEnabled, Dictionary<string, SeasonalEffectConfig> SeasonalEffects);

    [HttpGet]
    public ActionResult<ClientConfig> Get()
    {
        var cfg = JellioPlugin.Instance!.Configuration;

        var effects = new Dictionary<string, SeasonalEffectConfig>
        {
            ["winter"] = new(
                cfg.SeasonalWinterEnabled,
                new SeasonalRange(cfg.SeasonalWinterStartMonth, cfg.SeasonalWinterStartDay, cfg.SeasonalWinterEndMonth, cfg.SeasonalWinterEndDay)
            ),
            ["spring"] = new(
                cfg.SeasonalSpringEnabled,
                new SeasonalRange(cfg.SeasonalSpringStartMonth, cfg.SeasonalSpringStartDay, cfg.SeasonalSpringEndMonth, cfg.SeasonalSpringEndDay)
            ),
            ["summer"] = new(
                cfg.SeasonalSummerEnabled,
                new SeasonalRange(cfg.SeasonalSummerStartMonth, cfg.SeasonalSummerStartDay, cfg.SeasonalSummerEndMonth, cfg.SeasonalSummerEndDay)
            ),
            ["autumn"] = new(
                cfg.SeasonalAutumnEnabled,
                new SeasonalRange(cfg.SeasonalAutumnStartMonth, cfg.SeasonalAutumnStartDay, cfg.SeasonalAutumnEndMonth, cfg.SeasonalAutumnEndDay)
            ),
            ["halloween"] = new(
                cfg.SeasonalHalloweenEnabled,
                new SeasonalRange(cfg.SeasonalHalloweenStartMonth, cfg.SeasonalHalloweenStartDay, cfg.SeasonalHalloweenEndMonth, cfg.SeasonalHalloweenEndDay)
            ),
            ["newyear"] = new(
                cfg.SeasonalNewYearEnabled,
                new SeasonalRange(cfg.SeasonalNewYearStartMonth, cfg.SeasonalNewYearStartDay, cfg.SeasonalNewYearEndMonth, cfg.SeasonalNewYearEndDay)
            ),
            ["friday13"] = new(cfg.SeasonalFriday13Enabled, null),
        };

        return Ok(new ClientConfig(cfg.SeasonalEffectsEnabled, effects));
    }
}
