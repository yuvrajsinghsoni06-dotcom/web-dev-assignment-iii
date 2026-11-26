const mongoose = require('mongoose');
const Product = require('../models/Product');

// POST /api/products - create a product
async function createProduct(req, res, next) {
  try {
    const product = await Product.create(req.body);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
}

// GET /api/products - filter, sort and paginate products
async function getProducts(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.category) {
      filter.category = new RegExp(escapeRegex(req.query.category), 'i');
    }

    if (req.query.search) {
      const search = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = [{ name: search }, { sku: search }, { supplier: search }];
    }

    if (req.query.minPrice !== undefined || req.query.maxPrice !== undefined) {
      filter.price = {};
      if (req.query.minPrice !== undefined) filter.price.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice !== undefined) filter.price.$lte = Number(req.query.maxPrice);
      if (Object.values(filter.price).some(Number.isNaN)) {
        return res.status(400).json({ message: 'minPrice and maxPrice must be valid numbers' });
      }
    }

    if (req.query.inStock === 'true') filter.quantity = { $gt: 0 };
    if (req.query.inStock === 'false') filter.quantity = 0;

    let sortOptions = { createdAt: -1 };
    if (req.query.sortBy) {
      const allowedSort = ['name', 'price', 'quantity', 'reorderLevel', 'createdAt', 'category', 'supplier'];
      const field = allowedSort.includes(req.query.sortBy) ? req.query.sortBy : 'createdAt';
      const order = req.query.order === 'asc' || req.query.order === '1' ? 1 : -1;
      sortOptions = { [field]: order };
    } else if (req.query.sort) {
      const sortStr = String(req.query.sort);
      if (sortStr.startsWith('-')) {
        sortOptions = { [sortStr.substring(1)]: -1 };
      } else if (sortStr.includes(':')) {
        const [field, dir] = sortStr.split(':');
        sortOptions = { [field]: dir.toLowerCase() === 'desc' ? -1 : 1 };
      } else {
        sortOptions = { [sortStr]: 1 };
      }
    }

    const [products, total] = await Promise.all([
      Product.find(filter).sort(sortOptions).skip(skip).limit(limit),
      Product.countDocuments(filter)
    ]);

    res.status(200).json({
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      count: products.length,
      products
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/products/:id - get one product
async function getProductById(req, res, next) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.status(200).json(product);
  } catch (error) {
    next(error);
  }
}

// PUT /api/products/:id - update product details
async function updateProduct(req, res, next) {
  try {
    const allowedFields = ['name', 'sku', 'category', 'price', 'quantity', 'reorderLevel', 'supplier'];
    const updates = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'Provide at least one valid product field to update' });
    }
    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.status(200).json(product);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/products/:id/stock - safely adjust stock quantity
async function adjustStock(req, res, next) {
  try {
    const change = Number(req.body.change);
    if (!Number.isInteger(change) || change === 0) {
      return res.status(400).json({ message: 'change must be a non-zero whole number (positive to restock, negative for sale)' });
    }
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, quantity: { $gte: Math.max(0, -change) } },
      { $inc: { quantity: change } },
      { new: true, runValidators: true }
    );
    if (!product) {
      const exists = await Product.exists({ _id: req.params.id });
      return res.status(exists ? 400 : 404).json({
        message: exists ? 'Insufficient stock: quantity cannot become negative' : 'Product not found'
      });
    }
    res.status(200).json({ message: 'Stock updated', product });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/products/:id - delete a product
async function deleteProduct(req, res, next) {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.status(200).json({ message: 'Product deleted', id: product._id });
  } catch (error) {
    next(error);
  }
}

// GET /api/products/low-stock - products at or below their reorder level
async function getLowStockProducts(req, res, next) {
  try {
    const lowStockItems = await Product.aggregate([
      {
        $match: {
          $expr: { $lte: ['$quantity', '$reorderLevel'] }
        }
      },
      {
        $addFields: {
          stockValue: { $multiply: ['$price', '$quantity'] },
          id: { $toString: '$_id' }
        }
      },
      {
        $sort: { quantity: 1 }
      }
    ]);
    res.status(200).json({ count: lowStockItems.length, lowStockItems });
  } catch (error) {
    next(error);
  }
}

// GET /api/products/summary - category-wise aggregation report
async function getCategorySummary(req, res, next) {
  try {
    const summary = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          totalItems: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalStockValue: { $sum: { $multiply: ['$price', '$quantity'] } },
          avgPrice: { $avg: '$price' }
        }
      },
      {
        $project: {
          _id: 1,
          totalItems: 1,
          totalQuantity: 1,
          totalStockValue: { $round: ['$totalStockValue', 2] },
          avgPrice: { $round: ['$avgPrice', 2] }
        }
      }
    ]);
    res.status(200).json({ categories: summary.length, summary });
  } catch (error) {
    next(error);
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  adjustStock,
  deleteProduct,
  getLowStockProducts,
  getCategorySummary
};
