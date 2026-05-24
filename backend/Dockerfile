FROM dunglas/frankenphp:php8.3.31-bookworm

# Get Composer from official image
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Install pdo_mysql and other required extensions
RUN install-php-extensions pdo_mysql pdo mysqli mbstring xml curl zip bcmath tokenizer ctype fileinfo

# Increase PHP upload and memory limits in php.ini
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" && \
    sed -i 's/upload_max_filesize = 2M/upload_max_filesize = 100M/g' "$PHP_INI_DIR/php.ini" && \
    sed -i 's/post_max_size = 8M/post_max_size = 100M/g' "$PHP_INI_DIR/php.ini" && \
    sed -i 's/memory_limit = 128M/memory_limit = 512M/g' "$PHP_INI_DIR/php.ini"


WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install --optimize-autoloader --no-dev --no-scripts

COPY . .

RUN composer dump-autoload --optimize
RUN chmod -R 775 storage bootstrap/cache

EXPOSE 8080

CMD php artisan migrate --force && (php artisan storage:link 2>/dev/null || true) && SERVER_NAME=:${PORT:-8080} frankenphp run --config /etc/caddy/Caddyfile
