const express = require('express');
const {
  createProduct, getProducts, getProductById, updateProduct,
  adjustStock, deleteProduct, getLowStockProducts, getCategorySummary
} = require('../controllers/productController');

const router = express.Router();

// Keep report routes before /:id so their names are not treated as IDs.
router.get('/low-stock', getLowStockProducts);
router.get('/summary', getCategorySummary);
router.route('/').post(createProduct).get(getProducts);
router.route('/:id').get(getProductById).put(updateProduct).delete(deleteProduct);
router.patch('/:id/stock', adjustStock);

module.exports = router;
