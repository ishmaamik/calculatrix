import express from 'express';
import calculatorRoutes from './routes/calculator.routes.js';

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static('public'));
app.use(calculatorRoutes);

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
