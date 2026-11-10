// @chatic/storage — storage split by where a value lives. A domain declares the ports it needs; each app's entry
// point decides which store backs each port in its environment.
//
//   stores/  the stores themselves — memory, and the page's two web storages
//   dom/    a store seen as a DOM `Storage`, for code that only takes that shape

export * from './stores';
export * from './dom';
