"""Scientific regression against values stored in the research package (G5 §7, D6)."""
import numpy as np
import pytest

from terratwin_api.services import research_store as RS
from terratwin_api.services import tier1
from vendor.terratwin import oom_worker
from vendor.terratwin import similarity as SIM

from .conftest import requires_data


@requires_data
@pytest.mark.parametrize("weights", ["permanent_base", "equal"])
def test_tier1_reproduces_research_specificity_table(weights):
    """Live tier-1 screen over all 249,165 cells reproduces tier1_match_specificity.csv for every EZ."""
    spec = RS.table("tier1_match_specificity.csv")
    spec = spec[spec.weights == weights]
    mission = "permanent_base" if weights == "permanent_base" else "terrain_geometry_only"
    for r in spec.itertuples():
        s = tier1._scored(r.site, mission).similarity.to_numpy()
        lead = np.nanmax(s)
        assert lead == pytest.approx(r.leader_sim, abs=1e-9), r.site
        assert int((s >= lead - 0.05).sum()) == r.n_within_0p05, r.site
        assert int(np.nansum(s >= 0.75)) == r.n_ge_0p75, r.site


@requires_data
def test_truth_features_rotation_invariant():
    """G5 test 2: descriptors invariant under np.rot90 (max relative change <= 1e-12)."""
    pool = RS.pool_windows()
    for i in (0, 57, 120, 229):
        z = np.asarray(pool[i], float)
        f0 = np.array(oom_worker.features(z))
        for k in (1, 2, 3):
            fk = np.array(oom_worker.features(np.rot90(z, k)))
            ok = np.isfinite(f0)
            rel = np.abs(fk[ok] - f0[ok]) / np.maximum(np.abs(f0[ok]), 1e-12)
            assert rel.max() <= 1e-12


@requires_data
def test_landcover_negative_controls_all_fail():
    """G5 test 7: all six negative controls fail; McMurdo is unavailable and therefore not cleared."""
    lc = RS.pool_landcover()
    neg = RS.pool_meta().query("kind == 'negative control'").name
    assert len(neg) == 6 and not lc.loc[neg, "gate_pass"].any()
    assert not bool(lc.loc["McMurdo Dry Valleys", "gate_pass"])


@requires_data
def test_gated_decision_counts_match_key_numbers():
    k = RS.key_numbers("oom_gated_key_numbers.json")
    d = RS.oom_decisions(True)
    per = d.groupby("site").decision.first()
    assert (per == "named leader").sum() == k["gated_named"] == 29


@requires_data
def test_ungated_named_leader_count():
    d = RS.oom_decisions(False)
    assert (d.groupby("site").decision.first() == "named leader").sum() == 16


@requires_data
def test_synthetic_benchmark_headline_numbers():
    k = RS.key_numbers("oom_key_numbers.json")
    assert k["twin"]["M0_baseline"]["MRR"] == 0.3
    assert k["twin"]["M2_OOM"]["MRR"] == 0.973
    assert k["misspec_MRR"]["cubic"]["primary"] < k["misspec_MRR"]["cubic"]["baseline"]   # falsification stays visible


def test_slope_on_5_degree_plane():
    """D6 test 1."""
    from vendor.terratwin import terrain
    pix = 463.0935415503709
    x = np.arange(50) * pix
    z = np.tile(x * np.tan(np.radians(5.0)), (50, 1))
    s = terrain.slope_deg(z, pix)
    assert np.nanmax(np.abs(s[1:-1, 1:-1] - 5.0)) < 1e-9


def test_coverage_below_minimum_is_insufficient_evidence():
    """D6 test 10."""
    import pandas as pd
    mars = {"mean_slope_deg": 1.0, "slope_p90_deg": 2.0, "relative_relief_m": 300.0, "elev_std_m": 50.0,
            "rmsdev_short": 20.0, "rmsdev_long": 50.0, "hurst_2pt": 0.6}
    earth = pd.DataFrame([{**mars}, {"mean_slope_deg": 1.0}])
    r = SIM.score(mars, earth, feature_specs=SIM.TIER1_FEATURES, weights={k: 1.0 for k in mars})
    v = SIM.verdict(r)
    assert v.iloc[0] == "strong candidate analog" and v.iloc[1] == "insufficient evidence"
