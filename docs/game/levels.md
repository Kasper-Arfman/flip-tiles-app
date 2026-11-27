# The levels

How the levels are chosen. Back to [the documentation](../index.md).

Each level can earn three stars:

1. solve it, in any number of moves
2. solve it with flips only, in the fewest flips possible (*minFlips*)
3. solve it in the fewest moves possible, flips and forces (*minMoves*)

`npm run curate` goes through all 2^25 (33.5 million) boards. It keeps a board when:

- **minMoves < min(yellow, green)**: forcing every tile of one color doesn't earn the third star
- **it can be solved with flips only**: otherwise the second star can't be earned (only 1 in 4
  boards can)
- **minMoves ≤ minFlips**: always so (flips are moves too). When equal, the flips-only solution
  is also the fewest moves and earns both the second and third star (so in the easiest stages,
  where forces never help, a perfect flips-only solve earns all three stars)
- **minFlips ≥ 2** (`MIN_DIFFICULTY` in the script); the 1-flip stage is the hand-made tutorial
- **after δ Delta (more than 4 flips): minMoves < minFlips** (`STRICT_AFTER` in the script), so
  the third star always needs a force and a different solution than the second. (Not in Delta
  itself: no 4-flip board can be solved in fewer than 4 moves, so it would be empty.)

The difficulty (the tier, or stage) is minFlips: the flips-only star is the hard one, so a
level whose flips-only solution is longer is harder. Within a stage, levels are graded by
minMoves (fewer moves first); in the app a line between them says their number of moves. From γ
Gamma on, every stage has 16 to 32 levels: a stage with 1 grade has 16, with 2 or 3 grades 8 per
grade, with 4 or more grades 4 per grade (`perGrade` in the script). A grade with fewer boards
than its share is left out (it happens twice: one 2-move board at 11 flips, one 4-move board at
12 flips). The first stage, α Alpha, is a tutorial made by hand (`TUTORIAL`): the
two puzzles of How to play (a plus in the middle, 1 flip; a single odd tile in the middle, 1
force) and the one other single-tile board that flips alone can also clear (a tile diagonally
next to the middle). β Beta (2 flips) is made by hand too (`BETA`): the random 2-flip boards
were too trivial, so it has 4 chosen ones, each given by its two flips as (row, column). Then
γ Gamma (3 flips) up to μ Mu (12 flips). Rotations, mirror images and color swaps of a board
are the same puzzle, so each is kept only once; it is shown turned or mirrored at random, and in
each grade half the levels end on each color, so the color to aim for can't be guessed.

Alpha 2 and 3 (single tiles) take 8 and 11 flips for the flips-only star, far more than their
stage: the level screen marks that goal **Expert** with a red tag (`expertFlips` in
`levels.ts`: any level whose minFlips is above its stage's difficulty).

**Released levels stay.** The script first reads the current `levels.json` and keeps every level
in it, exactly as it is shown, as long as its grade still has room; new boards only fill up the
rest. At the end it lists any released level it had to leave out: players lose the stars they
earned there (see [Updating the game](#updating-the-game-without-players-losing-progress)).

The script picks the levels at random within each grade. Most boards have a middling minFlips, so a plain random pick per tier would
hardly include the easiest and hardest grades; picking per grade gives every grade the same
share. The levels are sorted by minFlips. In the app, a head stays at the top of a stage's
screen, under the top bar: the number of moves of the grade in view, its stars, arrows to the
grades before and after, and a dot per grade. The levels scroll up behind it, with a line
between the grades saying their number of moves (and for a locked grade, what opens it). An
arrow or a dot scrolls to a grade, its first row right under the head. The random picks use a fixed seed per tier, so every run picks the same levels, and
adding or removing a tier doesn't change the others. The script prints how many levels each
grade has and how many were picked.

Result of the current run:

| Stage (minFlips) | Unique levels available | Grades (minMoves) | Levels |
|---|---|---|---|
| α Alpha (1) | made by hand | 1 | 3 |
| β Beta (2) | made by hand | 2 | 4 |
| γ Gamma (3) | 318 | 3 | 16 |
| δ Delta (4) | 1,660 | 4 | 16 |
| ε Epsilon (5) | 87 | 3–4 | 16 (8 + 8) |
| ζ Zeta (6) | 2,176 | 3–5 | 24 (8 + 8 + 8) |
| η Eta (7) | 25,454 | 2–6 | 20 |
| θ Theta (8) | 108,323 | 3–7 | 20 |
| ι Iota (9) | 166,473 | 2–8 | 28 |
| κ Kappa (10) | 121,222 | 2–9 | 32 |
| λ Lambda (11) | 24,458 | 3–9 | 28 |
| μ Mu (12) | 1,625 | 5–8 | 16 |

No board needs more than 9 moves when forces are allowed. The script reads its numbers from the
solution tables; a sample of the levels was also checked with a separate brute-force solver.

## Bonus levels

Every stage from δ Delta on also has **bonus levels** (γ Gamma is too easy for them,
`BONUS_FROM`): boards of the same difficulty, by the same rules, that aren't in the game anywhere
else. The script picks 200 per stage, 600 stars (`BONUS_PER_STAGE`), in whole rows of 4, shared
out over the grades a row at a time, in turn: as evenly as can be, and a grade that runs out of
boards leaves its share to the others. Only ε Epsilon has fewer: it has just 68 new boards, and
gets 66 (`BONUS_COUNT`; its last row has 2), so the bonus levels give 4998 stars in all. 1666
levels:

| Stage | Bonus levels | Per grade (moves: levels) |
|---|---|---|
| δ Delta | 200 | 4: 200 |
| ε Epsilon | 66 | 3: 16, 4: 50 |
| ζ Zeta | 200 | 3: 8, 4: 96, 5: 96 |
| η Eta | 200 | 3: 36, 4: 56, 5: 56, 6: 52 |
| θ Theta | 200 | 40 each (3–7) |
| ι Iota | 200 | 2: 4, 3: 36, then 32 each (4–8) |
| κ Kappa | 200 | 32 each (3–7), 8: 28, 9: 12 |
| λ Lambda | 200 | 3: 4, 40 each (4–7), 8: 36 |
| μ Mu | 200 | 5: 52, 6: 52, 7: 48, 8: 48 |

In the game:
- **They are bought with coins, once their stage is complete** (every star): 200 coins
  (`BONUS_UNLOCK_COST` in `progress.ts`). They are offered on the home screen, on a blue strip
  joined to the bottom of the stage's card ("Bonus levels, 56 new puzzles", and *Unlock for
  200*), and on the stage's screen (the swap button in its top bar, with a small lock). Getting
  every bonus star pays 150 back (`BONUS_REWARD`); with the stage's own 50 (`STAGE_REWARD`),
  that is the 200 they cost. So in the end they cost nothing, but they are many and hard, so
  players want hints, which is where the game earns. *Unlock all* in the shop doesn't include
  them. Both the purchase and the reward are saved per stage (by the bonus levels' id), not per
  level: bonus levels added in an update are open to whoever bought them, and completing them
  again doesn't pay a second time.
- **On the home screen**, once they are bought, the stage's card gets a second bar right under
  its first, for the bonus stars, and the card then opens on the bonus levels.
- **In the stage**, a small round button in the top bar, like a phone's camera switch (two
  arrows round a small grid), goes to the stage's own levels and, from there, back to the bonus
  levels. Both sides keep the levels in the same place and size: the stage's side has an empty
  band at the top where the bonus side shows its grade, and the bonus pages leave the room of
  the stage's grade labels as margins. The bonus levels have a **page
  per grade**, like the pages of a phone's home screen: swipe left or right between them (on a
  computer, drag them with the mouse). Above the levels: the grade's number of moves and stars,
  an arrow on each side to the page before and after, and a dot per page showing which one
  you're on (a complete grade's dot is gold, and a dot can be tapped). Every grade is open at
  once.
- **Every bonus star of a stage** (a big achievement) makes its card **Mastered**: deep blue
  with a fine diamond pattern and twinkling sparkles, an ice-blue glowing rim, a blue Greek letter and
  difficulty stars, and both bars turned into rods of energy (a white-hot core, pulses flowing
  along, flashes racing through, in step); no star count.
- **Their stars are blue**, everywhere: on their screen, during and after a bonus level, and in
  their counts. They are counted apart: at the top of the home screen, next to the stages'
  stars, a second count (once any bonus levels are open), and on a complete stage's card, in
  place of the stage's own count. They don't count towards opening the
  next stages, the Codex, ranked mode or the stage's coin reward.

In the code, a stage's bonus levels are a tier of their own (`BONUS_TIERS` in `levels.ts`), with
`main` set to their stage. A tier's `id` is what addresses and the wallet use: a stage's id is
its difficulty (as before, so old saves still fit), its bonus levels' id is 100 + the difficulty.
So `#/tier/105` is Epsilon's bonus levels, and `#/level/105/12` is *Bonus Epsilon 12*. Released
bonus levels stay too, like the stages' levels.
