require('dotenv').config();
const express = require('express');
const connectDB = require('./src/config/db');
const productRoutes = require('./src/routes/productRoutes');
const { notFound, errorHandler } = require('./src/middleware/errorMiddleware');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Inventory and Data Management System API is running',
    student: 'john doe',
    status_code: '98545554',
    endpoints: '/api/products'
  });
});

app.use('/api/products', productRoutes);
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}).catch((error) => {
  console.error(`Unable to start application: ${error.message}`);
  process.exit(1);
});
