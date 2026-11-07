import { toRpsOfCode } from './orders.js';

export function registerSuggestionRoutes(app, getSuggestions) {
  const respond = async (raw, res, next) => {
    try {
      const values = Array.isArray(raw) ? raw : [raw];
      if (!values.length || values.length > 200 || values.some((value) => typeof value !== 'string' || !toRpsOfCode(value))) {
        res.status(400).json({ error: 'Indica entre 1 y 200 números de OF válidos.' });
        return;
      }
      res.json(await getSuggestions(values));
    } catch (error) { next(error); }
  };
  app.get('/api/of-suggestions', (req, res, next) => respond(req.query.of, res, next));
  app.post('/api/of-suggestions', (req, res, next) => respond(req.body?.ofs, res, next));
}
