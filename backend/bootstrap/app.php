<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use App\Http\Middleware\EnsureUserRole;
use App\Http\Middleware\EnsureUserIsActive;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => EnsureUserRole::class,
            'active' => EnsureUserIsActive::class,
            'auth.jwt' => \App\Http\Middleware\AuthenticateWithJWT::class,
        ]);

        $middleware->append(\App\Http\Middleware\SecurityHeadersMiddleware::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (\Throwable $e, \Illuminate\Http\Request $request) {
            if ($request->is('api/*')) {
                // Determine the status code
                $status = 500;
                if ($e instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface) {
                    $status = $e->getStatusCode();
                } elseif ($e instanceof \Illuminate\Auth\AuthenticationException) {
                    $status = 401;
                } elseif ($e instanceof \Illuminate\Validation\ValidationException) {
                    return response()->json([
                        'message' => $e->getMessage(),
                        'errors' => $e->errors(),
                    ], 422);
                } elseif ($e instanceof \Illuminate\Database\Eloquent\ModelNotFoundException || $e instanceof \Symfony\Component\HttpKernel\Exception\NotFoundHttpException) {
                    $status = 404;
                } elseif ($e instanceof \Illuminate\Auth\Access\AuthorizationException) {
                    $status = 403;
                }

                // Standardize all 401 and 403 exceptions to {"message": "Unauthorized"}
                if ($status === 401 || $status === 403) {
                    return response()->json(['message' => 'Unauthorized'], $status);
                }

                // Log detailed error context for 500 crashes
                if ($status === 500) {
                    \Illuminate\Support\Facades\Log::error('API Internal Server Error', [
                        'exception' => get_class($e),
                        'message' => $e->getMessage(),
                        'url' => $request->fullUrl(),
                        'method' => $request->method(),
                        'user_id' => $request->user()?->id,
                        'payload' => $request->except(['password', 'password_confirmation']),
                        'trace' => $e->getTraceAsString(),
                    ]);
                }

                // Standard production payload
                $response = [
                    'message' => $status === 500 && !config('app.debug') 
                        ? 'Une erreur interne du serveur est survenue. Notre équipe a été notifiée.' 
                        : $e->getMessage(),
                ];

                if (config('app.debug')) {
                    $response['exception'] = get_class($e);
                    $response['trace'] = explode("\n", $e->getTraceAsString());
                }

                return response()->json($response, $status);
            }
        });
    })->create();
