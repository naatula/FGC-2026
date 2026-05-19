# Optimal Strategy — 2026 *FIRST* Global Challenge: *Igniting Innovation*

A strategic analysis of the 2026 FGC game manual, derived from the scoring rules in
§3 and confirmed against the bundled `score-calculator.html`.

---

## 1. Scoring at a glance

For each Regional Alliance:

```
score = ceil(  suppression_balls × climb_multiplier
             + partner_climbs × 25
             + extinguisher_balls
             + coopertition_bonus
             + foul_bonus_from_opponent )
```

where

```
climb_multiplier = 1.00 + Σ per-robot increment
                                Contact = 0.05
                                Zone 1  = 0.10
                                Zone 2  = 0.20
                                Zone 3  = 0.30
```

| Action | Pts | Notes |
|---|---|---|
| Wildfire in **Suppression Unit** | 1 × multiplier | Regional only |
| Wildfire in **Extinguisher** | 1 | Both alliances |
| **Partner Climb** | 25 / supported robot | Regional, max 2 |
| **Coopertition Bonus** | 10 / 25 / 40 | Global, needs 4 / 5 / 6 robots in Zone 3 |
| Foul against opponent | +5% / +10% of their pre-penalty score | Awarded, not deducted |

Ball pool: **500 wildfire** released onto the field at "go". Match length: **2:30**.

---

## 2. The single most important number

The climb multiplier compounds on every suppression ball. With three robots in
Zone 3, the multiplier reaches **1.90** — every suppression ball is worth **90 %
more** than its face value.

| Climb result (3 robots) | Multiplier | Value of a suppression ball |
|---|---|---|
| All None | 1.00 | 1.00 |
| All Contact | 1.15 | 1.15 |
| All Zone 1 | 1.30 | 1.30 |
| All Zone 2 | 1.60 | 1.60 |
| All Zone 3 | **1.90** | **1.90** |

Combined with two partner climbs (50 pts), a successful triple Zone 3 climb is
worth roughly **+0.90 × suppression_balls + 50** vs. doing nothing. On 80
suppression balls that's **+122 pts** — typically larger than the entire
ball-scoring contribution of the other alliance.

**Conclusion:** the climb is not a finishing flourish, it is the centerpiece of
the match. Build, drive, and budget time around it.

---

## 3. Strategic priorities (in order)

### Priority 1 — Triple-Zone-3 climb every match
- Designate **one robot as the climber/anchor**: tall, rigid, with hooks or
  hangers that can carry two other robots' weight.
- The other two robots must have **mating geometry** to be hooked/supported by
  the anchor: lift bars, ring loops, or shaped tops.
- Robots must enter the brace in Zone 1 (rule G15) and traverse along it, so
  the anchor needs a passive winch or pull-up mechanism reaching ≥197 cm.
- Because the brace deflects up to 100 mm at center, anchors should
  over-engineer for sag.

### Priority 2 — Lock in the *Coopertition* Bonus
- With both alliances at 3-in-Z3 → 6 robots → **+40 pts to every team**.
- This is the single best return-on-coordination in the game. **Talk to the
  opposing alliance before each match.** It is a "global alliance" element by
  rule — there is no cost to helping them succeed at climbing.
- Even a partial agreement (one alliance climbs 3, the other 1 or 2) earns +10
  or +25 universally. **Never refuse to participate.**

### Priority 3 — Suppression > Extinguisher (when you climb)
Compare per-ball value to your alliance:

| Destination | Without climb | With Zone-3 triple |
|---|---|---|
| Suppression Unit | 1.00 | **1.90** |
| Extinguisher | 1.00 | 1.00 |

Every match in which you intend to climb, **the Suppression Unit dominates**.
The Extinguisher only "wins" per ball if your alliance has no climb, and even
then it ties.

But: Extinguisher points go to **both** alliances, so they're "free" from a
*regional rivalry* perspective — they don't help you beat the other side. They
do help your raw match score, and the ranking is the **average of your best
matches**, not a head-to-head record.

**Heuristic:** target roughly **80 % of robot ball-handling time on Suppression,
20 % on routing balls into Fire-Shield ports for the human to feed the
Extinguisher.** Drop Extinguisher entirely if you're behind in tempo and need
to maximize multiplier-amplified Suppression.

### Priority 4 — Direct suppression over fire-shield routing
A robot may score Suppression two ways:
1. Pick up wildfire → carry to Suppression Unit (single transport).
2. Push wildfire into Fire-Shield port → human places in chute → human pulls
   lever → ball drops to floor → robot picks up → carry to Suppression Unit
   (double transport + serial dependence on human).

Path 1 is strictly faster per ball. **Path 2 only makes sense** when:
- A robot can shove but not lift; the human + chute acts as a "ball lift".
- The chute is geometrically lined up with a robot that can intake from above.

Most teams should design their robot to handle path 1 natively.

### Priority 5 — Ranking-aware play
- Ranking score = **average of best matches** (lowest one dropped — rule M21,
  §6.3).
- Tiebreaker 1: **highest single match score** → there is a real incentive to
  go for a big match rather than steady mediocre matches.
- Tiebreaker 2: **cumulative Suppression points** → another reason to bias
  toward Suppression over Extinguisher.

Implication: don't sandbag. A blowout score with a good climb is more valuable
than two safe medium scores.

---

## 4. The 2:30 timeline

A workable match clock for an alliance executing the full plan:

| Time (remaining) | Phase | What each robot does |
|---|---|---|
| 2:30 → 2:00 | **Rush** | All 3 robots grab loose wildfire from center, hammer Suppression. Human players push port-shoved balls to the Extinguisher in parallel. |
| 2:00 → 1:00 | **Sustained scoring** | Continue Suppression. Robots cycle near Suppression Unit; humans empty Fire Shields whenever a port fills. |
| 1:00 → 0:35 | **Position** | Anchor robot drives toward Zone 1 of the brace. Other two finish last cycles and converge on the brace. |
| 0:35 → 0:10 | **Climb** | Anchor enters Zone 1 → Zone 2 → Zone 3. Partners attach to anchor and are lifted. |
| 0:10 → 0:00 | **Hold** | All three stable. Verify no contact with the playing-field surface; no contact with brace support hardware (rule G16/G19 notes — only the steel pipe counts). |

Why so early on the climb? The brace climb is the highest-variance scoring
action in the game. Rule G15: lose contact with Zone 2/3 → **must restart from
Zone 1**. A failed climb at 0:15 leaves no time to recover. Starting the climb
at 0:35 buys one retry.

---

## 5. Penalty-aware design (don't bleed points)

Foul penalties are calculated as **% of the offending alliance's pre-penalty
score and added to the opponent** — so a foul on a high-scoring match hurts
much more in absolute points than on a low-scoring one. A 10 % MAJOR FOUL on a
300-point match = **+30 pts to opponent**.

Highest-risk fouls to design / drive away from:

- **G01 / M16** — Pinning, blockading, tipping → MAJOR FOUL. Drive defensively
  around opponents on the Suppression Unit approach; don't camp the opposing
  robots' lanes.
- **G13** — Launching wildfire through the air → **RED CARD**. If you use any
  shooter mechanism, ensure trajectories stay low; carry-and-drop is safer.
- **G18** — Knocking another alliance's robot off the brace → escalating cards.
  Climb lanes are shared with your own partners; teach drivers to wait their
  turn rather than push.
- **M14** — If your robot doesn't move at the start, your 30-second touch
  window is the only repair window. Have a "dead-robot checklist": power, plug,
  loose wire. Don't touch any other robot or game piece while doing it (M12).

---

## 6. Robot design implications (translating strategy → hardware)

| Strategy point | Design requirement |
|---|---|
| Triple Zone-3 climb | One anchor robot with a deployable hanging mechanism reaching ~200 cm; passive lock so power loss doesn't drop it. Two partners with rigid, defined "hook here" geometry. |
| Direct Suppression scoring | Vertical scoring height: clear the 165 cm canopy bottom edge by a margin (R03 says ±25 mm field tolerance). |
| High wildfire throughput | Wide intake (R05 lets you extend 50 cm in one horizontal direction post-start), high-capacity hopper (G12: no holding limit). |
| Reliable start | R04: 50 × 50 × 50 cm starting volume. Bias compact and robust; extensions deploy *after* "go". |
| AprilTag navigation | Five tags on Suppression Units + Extinguisher faces — auto-aim Suppression scoring saves driver bandwidth for late-game maneuvering. |
| Easy game-piece removal (R08) | Make sure a stuck wildfire can be removed without power; otherwise a jam = game over. |

---

## 7. Alliance-level coordination

Three teams form a Regional Alliance every match in Ranking play, randomly
assigned (§3.2). You won't have practice time together. Before each match,
agree on three things at the queue:

1. **Climber identity** — which robot is the anchor? Pick by mechanism, not by
   ego. If no robot can anchor a triple climb, plan a double climb and one
   robot scoring to the buzzer.
2. **Lane assignment** — left robot, center robot, right robot. Three robots
   converging on one Suppression Unit causes congestion.
3. **Extinguisher commitment** — agree on whether human players will work the
   Extinguisher at all this match. If yes, robots route a fraction of balls to
   Fire Shield ports rather than Suppression.

Cross-alliance: **always pitch the 6-robot Coopertition climb** to the
opposing alliance. The +40 bonus is uncorrelated with who wins the match — it
is pure additive score for everyone. Refusing it is leaving free ranking points
on the table.

---

## 8. Pareto-optimal match outcomes (back-of-envelope)

Assume the field of 500 balls is split roughly evenly: ~200 Suppression each
side, ~100 Extinguisher (the rest end up uncontained — G14: those score 0).

**Floor — no climb, decent scoring:**
- 150 Suppression × 1.00 + 0 + 100 + 0 = **250**

**Solid — triple Zone 1 + two partner climbs:**
- 180 Suppression × 1.30 + 50 + 100 + 0 = **384**

**Strong — triple Zone 3 + two partner climbs (alone):**
- 200 Suppression × 1.90 + 50 + 100 + 10 = **540**
  *(Coop bonus from 4 robots if opponent gets 1 in Z3)*

**Maxed — both alliances triple-Z3 (full coopertition):**
- 200 × 1.90 + 50 + 100 + 40 = **570**

Note the last two rows: cooperating with the opposing alliance to get the full
+40 bonus *strictly Pareto-improves* your score (570 > 540) — there is no
defensive reason to deny it.

---

## 9. TL;DR — the 7-point strategy

1. **Build to climb.** The Zone-3 multiplier is the single biggest scoring
   lever in the game.
2. **One climber, two hangers.** Design the alliance composition around partner
   climbs; +50 pts is essentially free if the geometry mates.
3. **Start the climb at 0:35.** Failed climbs need restart time (rule G15).
4. **Score Suppression directly**, not through Fire Shields. Bypass the chute.
5. **Help the Extinguisher only in parallel** — humans work it while robots
   stay on Suppression.
6. **Always pitch the 6-robot coopertition climb** to the opposing alliance.
   +40 pts to both sides is the highest ROI conversation in the queue.
7. **Don't foul.** Penalties scale with your match score, so they punish your
   best matches the hardest, which are the ones determining your ranking
   (lowest match is dropped per M21).

The team that wins is the team whose climb works the most reliably. Everything
else is volume.
