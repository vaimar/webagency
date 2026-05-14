#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const airportMetadataPath = path.join(repoRoot, 'src/data/airportMetadata.ts');
const sourceUrl = 'https://en.wikipedia.org/w/index.php?title=List_of_Ryanair_destinations&action=raw';

const metadataSource = fs.readFileSync(airportMetadataPath, 'utf8');
const airportEntries = parseAirportMetadata(metadataSource);

if (airportEntries.length === 0) {
  throw new Error(`No airport entries were parsed from ${airportMetadataPath}.`);
}

const wikiSource = await fetchWikiSource(sourceUrl);
const destinations = parseRyanairDestinations(wikiSource);

if (destinations.length === 0) {
  throw new Error('No Ryanair destinations were parsed from the Wikipedia source.');
}

const coverage = buildCoverageReport(airportEntries, destinations);
const output = {
  sourceUrl,
  auditedAt: new Date().toISOString(),
  metadataAirportCount: airportEntries.length,
  ryanairDestinationCount: destinations.length,
  matchedDestinationCount: coverage.matched.length,
  unmatchedDestinationCount: coverage.unmatched.length,
  unmatchedByCountry: groupByCountry(coverage.unmatched),
  unmatchedSamples: coverage.unmatched.slice(0, 40),
};

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(0);
}

console.log(`Ryanair source: ${sourceUrl}`);
console.log(`Metadata airports: ${airportEntries.length}`);
console.log(`Wikipedia destinations parsed: ${destinations.length}`);
console.log(`Approximate matches: ${coverage.matched.length}`);
console.log(`Approximate unmatched destinations: ${coverage.unmatched.length}`);
console.log('');
console.log('Top unmatched countries:');
for (const item of output.unmatchedByCountry.slice(0, 12)) {
  console.log(`- ${item.country}: ${item.count}`);
}
console.log('');
console.log('Sample unmatched destinations:');
for (const item of output.unmatchedSamples) {
  console.log(`- ${item.country} | ${item.town} | ${item.airport}`);
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

async function fetchWikiSource(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; SlumberRyanairAudit/1.0; +https://github.com/)',
      'accept-language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`Wikipedia fetch failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
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

    const cleanedRow = stripWikiNoise(rawRow);
    const cells = cleanedRow.split('||').map((cell) => normalizeCell(cell));
    if (cells.length < 2) {
      continue;
    }

    let countryCell = '';
    let townCell = '';
    let airportCell = '';

    if (cells.length >= 5) {
      [countryCell, townCell, airportCell] = cells;
    } else {
      [townCell, airportCell] = cells;
    }

    if (countryCell.includes('rowspan=')) {
      countryCell = countryCell.split('|').pop() ?? countryCell;
    }

    if (countryCell) {
      currentCountry = countryCell;
    }

    const country = currentCountry;
    const town = townCell;
    const airport = airportCell;

    if (!country || !town || !airport) {
      continue;
    }

    destinations.push({ country, town, airport });
  }

  return destinations;
}

function stripWikiNoise(value) {
  return value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^/>]*\/>/g, '')
    .replace(/\{\{[^{}]*}}/g, '')
    .replace(/align=center\|/g, '')
    .replace(/class="[^"]*"\|/g, '')
    .trim();
}

function normalizeCell(value) {
  return decodeWikiLinks(value)
    .replace(/^\|+/, '')
    .replace(/^rowspan\s*=\s*"[^"]+"\s*\|/, '')
    .replace(/^colspan\s*=\s*"[^"]+"\s*\|/, '')
    .replace(/^style\s*=\s*"[^"]*"\s*\|/, '')
    .replace(/^align=center\|/, '')
    .replace(/^class\s*=\s*"[^"]*"\s*\|/, '')
    .replace(/\[\[/g, '')
    .replace(/]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeWikiLinks(value) {
  return value.replace(/\[\[(?:[^|]+\|)?(.*?)]]/g, '$1');
}

function buildCoverageReport(airports, destinations) {
  const knownNames = new Set();

  for (const airport of airports) {
    knownNames.add(normalizeName(airport.city));
    knownNames.add(normalizeName(airport.airportName));
    knownNames.add(normalizeName(`${airport.city} ${airport.country}`));
  }

  const matched = [];
  const unmatched = [];

  for (const destination of destinations) {
    const variants = [
      normalizeName(destination.town),
      normalizeName(destination.airport),
      normalizeName(`${destination.town} ${destination.country}`),
      normalizeName(destination.airport.replace(/ airport$/i, '')),
    ];

    if (variants.some((variant) => knownNames.has(variant))) {
      matched.push(destination);
    } else {
      unmatched.push(destination);
    }
  }

  return { matched, unmatched };
}

function normalizeName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function groupByCountry(destinations) {
  const counts = new Map();
  for (const destination of destinations) {
    counts.set(destination.country, (counts.get(destination.country) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((left, right) => right.count - left.count || left.country.localeCompare(right.country));
}





