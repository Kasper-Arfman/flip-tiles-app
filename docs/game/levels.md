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
minMoves (fewer moves first); a grade is the row of levels between two divider lines. From γ
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
share. The levels are sorted by minFlips; in the app, a thin line in the level grid separates
the grades. The random picks use a fixed seed per tier, so every run picks the same levels, and
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
