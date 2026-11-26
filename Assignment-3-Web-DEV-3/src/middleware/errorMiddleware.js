function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
}

function errorHandler(err, req, res, next) {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || 'Internal Server Error';

  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid product ID';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((item) => item.message).join(', ');
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'A product with this SKU already exists';
  } else if (err.name === 'SyntaxError' && 'body' in err) {
    statusCode = 400;
    message = 'Invalid JSON request body';
  }

  res.status(statusCode).json({ message });
}

module.exports = { notFound, errorHandler };
