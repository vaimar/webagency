#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const airportMetadataPath = path.join(repoRoot, 'src/data/airportMetadata.ts');
const sourceUrl = 'https://en.wikipedia.org/w/index.php?title=List_of_Ryanair_destinations&action=raw';
const defaultCountries = ['France', 'Italy', 'Germany', 'United Kingdom', 'Greece'];

const args = parseArgs(process.argv.slice(2));
const requestedCountries = args.countries.length > 0 ? args.countries : defaultCountries;

const metadataSource = fs.readFileSync(airportMetadataPath, 'utf8');
const existingCodes = new Set(parseAirportMetadata(metadataSource).map((airport) => airport.code));

const wikiSource = await fetchText(sourceUrl, {
  'user-agent': 'Mozilla/5.0 (compatible; SlumberRyanairResolver/1.0; +https://github.com/)',
  'accept-language': 'en-US,en;q=0.9',
});

const destinations = parseRyanairDestinations(wikiSource)
  .filter((destination) => requestedCountries.includes(destination.country));

const pageTitles = Array.from(new Set(destinations.map((destination) => destination.airportPageTitle).filter(Boolean)));
const titleToWikidataId = await resolveWikipediaTitlesToWikidataIds(pageTitles);
const wikidataIds = Array.from(new Set(Object.values(titleToWikidataId).filter(Boolean)));
const entities = await fetchWikidataEntities(wikidataIds);

const candidates = destinations.map((destination) => {
  const wikidataId = destination.airportPageTitle ? titleToWikidataId[destination.airportPageTitle] ?? null : null;
  const entity = wikidataId ? entities[wikidataId] ?? null : null;
  const iataCode = readIataCode(entity);

  return {
    country: destination.country,
    city: destination.town,
    airportName: destination.airport,
    airportPageTitle: destination.airportPageTitle,
    wikidataId,
    code: iataCode,
    existsInMetadata: Boolean(iataCode && existingCodes.has(iataCode)),
  };
});

const filteredCandidates = candidates.filter((candidate) => !candidate.existsInMetadata);

const output = {
  sourceUrl,
  generatedAt: new Date().toISOString(),
  countries: requestedCountries,
  totalDestinationsConsidered: destinations.length,
  candidates: filteredCandidates,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

function parseArgs(argv) {
  const countriesArg = argv.find((item) => item.startsWith('--countries='));
  const countries = countriesArg
    ? countriesArg.slice('--countries='.length).split(',').map((item) => item.trim()).filter(Boolean)
    : [];

  return { countries };
}

function parseAirportMetadata(source) {
  const blockPattern = /\{\s*code:\s*'([^']+)'\s*,\s*city:\s*'([^']+)'\s*,\s*country:\s*'([^']+)'\s*,\s*flag:\s*'([^']+)'\s*,\s*airportName:\s*'([^']+)'/gs;
  const entries = [];
  let match;

  while ((match = blockPattern.exec(source)) !== null) {
    entries.push({
      code: match[1],
      city: match[2],
      country: match[3],
      flag: match[4],
      airportName: match[5],
    });
  }

  return entries;
}

function parseRyanairDestinations(rawSource) {
  const listSection = rawSource.split('== List ==')[1];
  if (!listSection) {
    throw new Error('Unable to locate the Ryanair destinations list in the Wikipedia source.');
  }

  const tableSource = listSection.split('|}')[0];
  const rows = tableSource.split(/\n\|-\n/);
  const destinations = [];
  let currentCountry = null;

  for (const rawRow of rows) {
    if (!rawRow.includes('||') || rawRow.includes('! Country')) {
      continue;
    }

    const cells = rawRow.split('||').map((cell) => cell.trim());
    if (cells.length < 2) {
      continue;
    }

    let countryCell = '';
    let townCell;
    let airportCell;

    if (cells.length >= 5) {
      [countryCell, townCell, airportCell] = cells;
    } else {
      [townCell, airportCell] = cells;
    }

    countryCell = normalizeRowPrefix(countryCell);
    townCell = normalizeRowPrefix(townCell);
    airportCell = normalizeRowPrefix(airportCell);

    const country = decodeWikiLabel(countryCell);
    if (country) {
      currentCountry = country;
    }

    const town = decodeWikiLabel(townCell);
    const airport = decodeWikiLabel(airportCell);
    const airportPageTitle = extractFirstWikiTitle(airportCell);

    if (!currentCountry || !town || !airport) {
      continue;
    }

    destinations.push({
      country: currentCountry,
      town,
      airport,
      airportPageTitle,
    });
  }

  return destinations;
}

function normalizeRowPrefix(value) {
  return value
    .replace(/^\|+/, '')
    .replace(/^rowspan\s*=\s*"[^"]+"\s*\|/, '')
    .replace(/^colspan\s*=\s*"[^"]+"\s*\|/, '')
    .replace(/^style\s*=\s*"[^"]*"\s*\|/, '')
    .replace(/^align=center\|/, '')
    .replace(/^class\s*=\s*"[^"]*"\s*\|/, '')
    .trim();
}

function decodeWikiLabel(value) {
  return value
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^/>]*\/>/g, '')
    .replace(/\{\{[^{}]*}}/g, '')
    .replace(/\[\[(?:[^|]+\|)?(.*?)]]/g, '$1')
    .replace(/'''+/g, '')
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFirstWikiTitle(value) {
  const match = value.match(/\[\[([^|]+?)(?:\|.*?)?]]/);
  return match?.[1]?.trim() ?? null;
}

async function resolveWikipediaTitlesToWikidataIds(titles) {
  const mapping = {};

  for (const batch of chunk(titles, 50)) {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('prop', 'pageprops');
    url.searchParams.set('ppprop', 'wikibase_item');
    url.searchParams.set('redirects', '1');
    url.searchParams.set('titles', batch.join('|'));

    const payload = JSON.parse(await fetchText(url.toString(), {
      'user-agent': 'Mozilla/5.0 (compatible; SlumberRyanairResolver/1.0; +https://github.com/)',
      'accept-language': 'en-US,en;q=0.9',
    }));

    const pages = Object.values(payload.query?.pages ?? {});
    for (const page of pages) {
      if (typeof page.title === 'string' && typeof page.pageprops?.wikibase_item === 'string') {
        mapping[page.title] = page.pageprops.wikibase_item;
      }
    }
  }

  return mapping;
}

async function fetchWikidataEntities(ids) {
  const entities = {};

  for (const batch of chunk(ids, 50)) {
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('format', 'json');
    url.searchParams.set('ids', batch.join('|'));
    url.searchParams.set('props', 'claims');

    const payload = JSON.parse(await fetchText(url.toString(), {
      'user-agent': 'Mozilla/5.0 (compatible; SlumberRyanairResolver/1.0; +https://github.com/)',
      'accept-language': 'en-US,en;q=0.9',
    }));

    Object.assign(entities, payload.entities ?? {});
  }

  return entities;
}

function readIataCode(entity) {
  const claim = entity?.claims?.P238?.[0];
  return typeof claim?.mainsnak?.datavalue?.value === 'string'
    ? claim.mainsnak.datavalue.value.toUpperCase()
    : null;
}

async function fetchText(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

