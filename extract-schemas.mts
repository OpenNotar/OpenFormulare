import { adoption } from './frontend/src/schemas/adoption.js';
import { anteilskauf } from './frontend/src/schemas/anteilskauf.js';
import { ehevertrag } from './frontend/src/schemas/ehevertrag.js';
import { erbauseinandersetzung } from './frontend/src/schemas/erbauseinandersetzung.js';
import { erbausschlagung } from './frontend/src/schemas/erbausschlagung.js';
import { erbschein } from './frontend/src/schemas/erbschein.js';
import { gbr } from './frontend/src/schemas/gbr.js';
import { handelsregister } from './frontend/src/schemas/handelsregister.js';
import { immobilienkauf } from './frontend/src/schemas/immobilienkauf.js';
import { scheidungsvereinbarung } from './frontend/src/schemas/scheidungsvereinbarung.js';
import { schenkung } from './frontend/src/schemas/schenkung.js';
import { testament } from './frontend/src/schemas/testament.js';
import { unternehmensgruendung } from './frontend/src/schemas/unternehmensgruendung.js';
import { unterschriftsbeglaubigung } from './frontend/src/schemas/unterschriftsbeglaubigung.js';
import { verein } from './frontend/src/schemas/verein.js';
import { vorsorgevollmacht } from './frontend/src/schemas/vorsorgevollmacht.js';

const schemas = [
  adoption, anteilskauf, ehevertrag, erbauseinandersetzung,
  erbausschlagung, erbschein, gbr, handelsregister,
  immobilienkauf, scheidungsvereinbarung, schenkung, testament,
  unternehmensgruendung, unterschriftsbeglaubigung, verein, vorsorgevollmacht,
];

console.log(JSON.stringify(schemas, null, 2));
