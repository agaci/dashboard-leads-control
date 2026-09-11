import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

/** Liga o loader-ts.mjs. Ver la o porque. */
register('./loader-ts.mjs', pathToFileURL('./scripts/'));
