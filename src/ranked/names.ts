// Names on the online leaderboards: what a name may be. The same rules in the app (the player
// is told at once when a name can't be used) and on the server (netlify/leaderboard.ts: a
// changed app can't get around them).
//
// Apple (App Review Guideline 1.2) and Google Play (User Generated Content policy) ask an app
// with names that others see for: a filter on offensive names (here), a way to report one, and
// to block it (the leaderboards' Report: hidden for the reporter at once, for everyone after a
// few reports or when you hide it yourself; see docs/developer/leaderboards.md).
//
// The filter is the `obscenity` library's English word list (it also catches spellings like
// "sh1t" and "f.u.c.k"), with a few Dutch words added. It looks for whole words and parts of
// words, but knows the usual innocent words ("Scunthorpe", "assassin", "Dickens").
import {
  DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers, pattern,
} from "obscenity";
import { NAME_MAX } from "./rules";

// Dutch words to refuse as well (|...|: only as a whole word)
const DUTCH = [pattern`kanker`, pattern`|kut|`, pattern`hoer`, pattern`tering`, pattern`tyfus`, pattern`mongool`, pattern`|neger|`];

const dataset = new DataSet<{ originalWord: string }>().addAll(englishDataset);
for (const p of DUTCH) dataset.addPhrase((phrase) => phrase.setMetadata({ originalWord: "dutch" }).addPattern(p));
const matcher = new RegExpMatcher({ ...dataset.build(), ...englishRecommendedTransformers });

// A name as shown: at most NAME_MAX characters, no control characters or < >, never empty
export const cleanName = (name: unknown) =>
  (typeof name === "string" ? name.replace(/[\p{C}<>]/gu, "").trim().slice(0, NAME_MAX) : "") || "Player";

// The name shown instead of one that was refused or hidden
export const HIDDEN_NAME = "Player";

// Whether a name is offensive: as written, and with its spaces and dots taken out ("f u c k")
export function isOffensive(name: string): boolean {
  return matcher.hasMatch(name) || matcher.hasMatch(name.replace(/[\s._\-*]+/g, ""));
}
