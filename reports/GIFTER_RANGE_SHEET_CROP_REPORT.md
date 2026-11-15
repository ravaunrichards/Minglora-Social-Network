# Gifter Range-Sheet Crop Report

Only the six original Gifter range-reference JPGs were processed to remove solid-black outer edge padding. The badges, lettering, level order, internal artwork, 11 detailed panels, master sheets, Rewards banner, progression logic, Coin thresholds, wallets and deleted Level-Up chart were not changed.

| Source sheet | Before | After | Cropped pixels (L / T / R / B) |
|---|---:|---:|---:|
| LV.1 - LV.9.jpg | 985×566 | 985×566 | 0 / 0 / 0 / 0 |
| LV.10 - LV.19.jpg | 989×560 | 989×560 | 0 / 0 / 0 / 0 |
| LV.20 - LV.29.jpg | 998×580 | 998×580 | 0 / 0 / 0 / 0 |
| LV.30 - LV.39.jpg | 995×580 | 995×580 | 0 / 0 / 0 / 0 |
| LV.40 - LV.49.jpg | 988×588 | 988×588 | 0 / 0 / 0 / 0 |
| LV.50+.jpg | 1006×592 | 1006×592 | 0 / 0 / 0 / 0 |

Detection rule: near-black pixels have every RGB channel ≤ 42; an outer row or column is removed only when at least 99.2% of its pixels meet that rule. A 12% per-edge cap and 76% minimum-content gate prevent aggressive crops.

All six source sheets decoded successfully. Cropped JPGs were re-encoded at quality 95 with progressive encoding and 4:4:4 chroma sampling. The before/after contact sheet and detailed pixel/hash metrics are attached to the workflow review artifact.
