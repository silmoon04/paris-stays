import { checks, value, fact, type Stay } from "./domain";
import { filterChecks, DEFAULT_FILTERS, type Filters } from "./filters";
export function hostMessage(stay: Stay, filters: Filters = DEFAULT_FILTERS) {
  const todo = new Set(filterChecks(stay, filters));
  const questions: string[] = [];
  const wc = value(stay, "toilets");
  questions.push(typeof wc === "number" && wc >= 3 ? "Could you confirm the home has three separate toilets/WCs?" : "How many separate toilets/WCs are there (not just bathrooms)? We need at least three.");
  if (todo.has("Proper beds") || todo.has("Inferred bed layout") || todo.has("Bedrooms")) questions.push("Are there at least four proper beds, excluding sofa beds, across at least three bedrooms?");
  if (todo.has("Stair access")) questions.push("Is there a working lift or a route with only a few entrance steps, and no stairs inside to reach bedrooms, bathrooms or the kitchen?");
  if (todo.has("Shower")) questions.push("Is there a shower, and does it require stepping over a bath?");
  if (todo.has("Table for five")) questions.push("Can five adults sit comfortably together at the dining table?");
  if (todo.has("Kitchen")) questions.push("Is there a usable kitchen with a hob, fridge and cooking equipment?");
  if (todo.has("Full trip price") || todo.has("Fresh quote") || todo.has("Availability")) questions.push("Is it available for these dates, and what is the total including all fees and taxes?");
  if (fact(stay, "lift")?.conflicts?.length) questions.push("Could you clarify the lift access, as the information is conflicting?");
  const conflicts = stay.enrichment?.reviewSummary?.conflicts ?? [];
  if (conflicts.length) questions.push("Could you also clarify the access or facility issue raised in the recent reviews?");
  return `Hi! We're a family of five adults looking to stay 31 October–4 November 2026. ${questions.join(" ")} Thanks!`;
}
export function hostMessageBundle(stays: Stay[], filters: Filters = DEFAULT_FILTERS) {
  return stays.filter(s => checks(s).length || filterChecks(s, filters).length).map(s => ({ id: s.id, title: s.title, url: s.url, missing: filterChecks(s, filters), message: hostMessage(s, filters) }));
}
