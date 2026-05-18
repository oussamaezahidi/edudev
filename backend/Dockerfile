FROM dunglas/frankenphp:php8.3.31-bookworm

# Install pdo_mysql and other required extensions
RUN install-php-extensions pdo_mysql pdo mysqli mbstring xml curl zip bcmath tokenizer ctype fileinfo

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install --optimize-autoloader --no-dev --no-scripts

COPY . .

RUN composer dump-autoload --optimize
RUN chmod -R 775 storage bootstrap/cache

EXPOSE 8080

CMD php artisan config:clear && php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=${PORT:-8080}
