/**
 * Error Handler Middleware - Xử lý lỗi toàn cục cho API
 */

const logger = require('../../../logger');

const errorHandler = (err, req, res, next) => {
  logger.error(`[ErrorHandler] ${err.message}`);
  logger.error(`[ErrorHandler] Stack: ${err.stack}`);

  // Xác định status code
  let statusCode = err.statusCode || 500;

  // Các lỗi cụ thể
  if (err.message.includes('not found')) {
    statusCode = 404;
  } else if (err.message.includes('already running') || err.message.includes('already exists')) {
    statusCode = 409;
  } else if (err.message.includes('required') || err.message.includes('invalid')) {
    statusCode = 400;
  }

  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

module.exports = errorHandler;
