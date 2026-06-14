import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors()); // Configure allowed origins, methods, and headers for production
app.use(express.json());

// Main Skill: Tells funny programmer jokes
// Instructions: Tell clean and funny jokes about programming and computer science.
app.get('/joke-teller', async (req, res) => {
  const { input } = req.query;
  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or invalid required query parameter: input' });
  }

  // TODO: replace with real logic for "Joke Teller"
  res.json({ result: `Received input: ${input}` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
  console.log(`Joke Teller action server listening on port ${port}`);
});
