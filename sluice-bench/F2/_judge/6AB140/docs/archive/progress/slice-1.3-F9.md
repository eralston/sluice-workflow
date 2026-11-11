# Slice 1.3-F9: the quotes

**Status:** built 2026-10-27; no human gate. Plan: [23-v1.3.md](../23-v1.3.md) Block F. Config text only; no code changed.

## 1. What was built
Each of the 12 quotes in `config/cosmos-quotes.txt` was checked on the web for its wording, its speaker and
its named source. The list is kept: none was dropped. Four lines were corrected (below); the header comments and
the `“quote” — Name, Source` format are unchanged. Where a quote has no single work, the source stays off.

| # | Quote | Verdict | Evidence |
|---|---|---|---|
| 1 | Sagan, "We are a way for the cosmos to know itself." | kept (Cosmos) | Episode 1 transcript, https://amara.org/subtitles/owfwOsnOXVfx/en/1/download/Cosmos%20A%20Personal%20Voyage%20-%20Episode%201%20Carl%20Sagan.en.vtt ; https://www.planetary.org/articles/20131014-cosmos-with-comos-the-shores-of-the-cosmic-ocean |
| 2 | Sagan, "For small creatures such as we..." | kept (Contact) | https://en.wikiquote.org/wiki/Carl_Sagan (Contact, 1985, same wording); see section 5 on Ann Druyan |
| 3 | Sagan, "Look again at that dot..." | kept (Pale Blue Dot) | https://www.planetary.org/worlds/pale-blue-dot (full text, 1994 book) |
| 4 | Adams, "Space is big..." | reworded: restored "Really big." | https://en.wikiquote.org/wiki/The_Hitchhiker%27s_Guide_to_the_Galaxy_(film) (Guide section: "is big. Really big. You just won't believe how vastly, hugely, mind-bogglingly big it is") |
| 5 | Le Guin, "It is good to have an end to journey toward..." | reworded: "towards", as in the novel (ch. 15) | https://quoteinvestigator.com/2021/07/29/journey-matters/ |
| 6 | Butler, "All that you touch you change..." | kept (Parable of the Sower) | https://en.wikipedia.org/wiki/Earthseed (the central Earthseed verse of the novel); secondary only |
| 7 | Feynman, "Nature uses only the longest threads..." | reworded: "so that each small piece" | https://en.wikiquote.org/wiki/Richard_Feynman (The Character of Physical Law, 1965, ch. 1); https://www.openculture.com/2021/12/the-character-of-physical-law-richard-feynmans-legendary-course-presented-at-cornell-1964.html |
| 8 | Hawking, "Remember to look up at the stars..." | kept, no source | https://language.chinadaily.com.cn/2012-01/10/content_14417295.htm (Cambridge birthday-symposium speech); no transcript found |
| 9 | Tyson, "The universe is under no obligation..." | source added: Astrophysics for People in a Hurry | https://en.wikiquote.org/wiki/Neil_deGrasse_Tyson (epigraph, p. 13, Norton 2017) |
| 10 | Tsiolkovsky, "The Earth is the cradle of humanity..." | kept, no source | https://en.wikiquote.org/wiki/Konstantin_Tsiolkovsky (Russian original, c. 1911-12; "live" in the usual English is "remain") |
| 11 | Hubble, "Equipped with his five senses..." | kept (The Nature of Science) | https://www.andrew.cmu.edu/course/76-101AA/readings/Hubble.htm (reprint of "The Nature of Science"); Wikiquote disagrees, see section 5 |
| 12 | Williams, "I have loved the stars too fondly..." | reworded: "truly", the 1868 text | https://en.wikiquote.org/wiki/Sarah_Williams_(poet) (Twilight Hours, 1868, "The Old Astronomer", st. 4; "fondly" is a 1936 anthology variant) |

## 2. Contracts changed
None. `config/cosmos-quotes.txt` is user-editable text (06 §3); the format and `parseQuotes` are untouched.
`docs/23-v1.3.md` §3 Block F: F9's State is now `built`.

## 3. Checks
Unit: `tests/unit/scale.test.ts` reads this file (at least 8 quotes, each starting with an opening curly quote and
having a non-empty source). The edit keeps all 12 lines and the format. No npm, e2e or build command was run for this
slice (another agent was running e2e); run `npm test -- tests/unit` before the commit.

## 4. Human gates
None. To look: open an empty cosmos (no project loaded); the quote rotates. The Adams line is now longer, so check
that it fits the quote area.

## 5. Known limitations and open questions
- **Hawking:** he is widely reported as saying it (2010 ABC interview; 2012 Cambridge speech, per China Daily), but no
  transcript or recording was found, so there is no source. The wording is the common short form.
- **Hubble:** the 1954 *The Nature of Science and Other Lectures* is supported by the CMU reprint and quote sites;
  Wikiquote instead cites Harper's, May 1929, "The Exploration of Space". Not settled; the source stays as it was.
- **Tsiolkovsky:** the commonly cited origin (an 1911 letter, or the 1911-12 *Exploration of Cosmic Space by Means of
  Reaction Devices*) is uncertain, so none is named. "Earth ... humanity" is the standard popular translation of
  "planet ... mind".
- **Sagan, Contact:** Sasha Sagan's book *For Small Creatures Such As We* says her mother Ann Druyan, who co-wrote the
  novel, came up with the line. The novel is Sagan's by credit, so it stays; the claim is a review's, not verified.
- **Butler:** verified only by secondary sources (the verse is Earthseed's opening). The book was not read.
