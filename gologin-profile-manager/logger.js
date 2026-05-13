const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;

const myFormat = printf(({ level, message,  timestamp }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const logger = createLogger({
    level: 'debug',
    format: combine(
        timestamp(),
        myFormat
    ),
    transports: [
        new transports.File({ filename: 'profiles.log' })
    ]
});

// chỉ ghi log ra console nếu không phải là môi trường production
if (process.env.NODE_ENV !== 'production') {
    logger.add(new transports.Console({
        format: combine(
            timestamp(),
            myFormat
        )
    }));
}
module.exports = logger;


