import { adoption } from './frontend/src/schemas/adoption';
import { anteilskauf } from './frontend/src/schemas/anteilskauf';
import { ehevertrag } from './frontend/src/schemas/ehevertrag';
import { erbauseinandersetzung } from './frontend/src/schemas/erbauseinandersetzung';
import { erbausschlagung } from './frontend/src/schemas/erbausschlagung';
import { erbschein } from './frontend/src/schemas/erbschein';
import { gbr } from './frontend/src/schemas/gbr';
import { handelsregister } from './frontend/src/schemas/handelsregister';
import { immobilienkauf } from './frontend/src/schemas/immobilienkauf';
import { scheidungsvereinbarung } from './frontend/src/schemas/scheidungsvereinbarung';
import { schenkung } from './frontend/src/schemas/schenkung';
import { testament } from './frontend/src/schemas/testament';
import { unternehmensgruendung } from './frontend/src/schemas/unternehmensgruendung';
import { unterschriftsbeglaubigung } from './frontend/src/schemas/unterschriftsbeglaubigung';
import { verein } from './frontend/src/schemas/verein';
import { vorsorgevollmacht } from './frontend/src/schemas/vorsorgevollmacht';

const schemas = [
  adoption, anteilskauf, ehevertrag, erbauseinandersetzung,
  erbausschlagung, erbschein, gbr, handelsregister,
  immobilienkauf, scheidungsvereinbarung, schenkung, testament,
  unternehmensgruendung, unterschriftsbeglaubigung, verein, vorsorgevollmacht,
];

process.stdout.write(JSON.stringify(schemas));
