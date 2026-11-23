# contact helpers — details behind the contact tab's rules

The seven rules for turning a device contact into a row are in
[invite.md § The contact tab](./invite.md#the-contact-tab). This page adds the parts of
`utils/deviceContact.ts` that those rules do not spell out.

- **Name parts are ordered by script.** When any part is Korean, Han or kana, the name is composed
  family name first and joined with no space (`김민수`); otherwise it is given name, middle name,
  family name with spaces. It exists because iOS sends only the parts. On iPhone there is no
  composed `displayName` to read, so the parts are the only source of a name.
- **The sort looks at the first character after NFC normalisation.** A name stored decomposed starts
  with a conjoining jamo, which the Hangul range of the sort does not cover, so without
  normalising it would sort after every Latin name. Within a block, labels are compared with a Korean
  collator that reads digit runs as numbers.
- **Number reading is memoised.** The list reads each contact's numbers several times per render
  (the filter, the search text, the second line, the invitable check), and each read is a phone
  library parse. The result is kept by the countries tried plus the number exactly as stored. The
  countries are in the key because the same `090-…` is a mobile or not depending on the device
  locale. The memo holds up to 5000 entries and is emptied when full, which an address book never
  reaches; the cap only keeps a long session from growing it forever.
- **The locale's country is memoised by language.** Reading it builds an `Intl.Locale`, so it is
  re-read only when `navigator.language` changes.
