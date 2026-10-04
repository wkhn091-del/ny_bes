import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SEED_AMENITIES, SEED_BRANCHES, SEED_CITIES, SEED_SPACES } from '@/content/seed-data';
import { buildCatalogSearchIndex, searchCatalog, scopeLabel } from './catalog-index';
import { editDistance, normalize, parseQuery } from './fuzzy';

const index = buildCatalogSearchIndex({
  spaces: SEED_SPACES,
  branches: SEED_BRANCHES,
  cities: SEED_CITIES,
  amenities: SEED_AMENITIES,
});

function names(query: string): string[] {
  return searchCatalog(index, query).spaces.map((d) => d.space.name);
}

describe('normalize', () => {
  it('folds final letters, niqqud and punctuation', () => {
    assert.equal(normalize('חֲדַר  יְשִׁיבוֹת!'), 'חדר ישיבות');
    assert.equal(normalize('מסך 65 אינץ׳'), 'מסכ 65 אינצ');
    assert.equal(normalize('ת"א'), 'תא');
  });
});

describe('editDistance', () => {
  it('counts adjacent transpositions as one edit', () => {
    assert.equal(editDistance('ישיובת', 'ישיבות'), 1);
    assert.equal(editDistance('abc', 'abc'), 0);
    assert.equal(editDistance('abc', 'xyz', 1), 2);
  });
});

describe('parseQuery', () => {
  it('expands multi-word synonyms', () => {
    assert.deepEqual(parseQuery('tel aviv'), [['תל'], ['אביב']]);
    assert.deepEqual(parseQuery('tlv'), [['תל'], ['אביב']]);
  });
});

describe('searchCatalog', () => {
  it('finds meeting rooms with an exact query', () => {
    const result = names('חדר ישיבות');
    assert.ok(result.length > 0);
    assert.ok(result.every((n) => n.includes('ישיבות')));
  });

  it('tolerates a typo', () => {
    assert.ok(names('חדר ישיובת').some((n) => n.includes('ישיבות')));
  });

  it('tolerates a Hebrew prefix ("בחיפה")', () => {
    const docs = searchCatalog(index, 'בחיפה').spaces;
    assert.ok(docs.length > 0);
    assert.ok(docs.every((d) => d.branch.city.slug === 'haifa'));
  });

  it('autocompletes a partial word', () => {
    assert.ok(names('משר').some((n) => n.includes('משרד')));
  });

  it('understands English and slang', () => {
    assert.ok(names('meeting').some((n) => n.includes('ישיבות')));
    const tlv = searchCatalog(index, 'tlv').spaces;
    assert.ok(tlv.length > 0 && tlv.every((d) => d.branch.city.slug === 'tel-aviv'));
  });

  it('matches amenities', () => {
    assert.ok(searchCatalog(index, 'מקרן').spaces.length > 0);
  });

  it('suggests a correction for a misspelled query', () => {
    assert.equal(searchCatalog(index, 'ירושלאים').didYouMean, 'ירושלים');
  });

  it('returns nothing for gibberish instead of random rows', () => {
    assert.deepEqual(names('קקקקקקקק'), []);
  });

  it('offers city + type scopes', () => {
    const scopes = searchCatalog(index, 'חדרי ישיבות תל אביב').scopes.map(scopeLabel);
    assert.ok(scopes.includes('חדרי ישיבות בתל אביב'));
  });

  it('caps very long input', () => {
    assert.doesNotThrow(() => searchCatalog(index, 'א'.repeat(10_000)));
  });
});
