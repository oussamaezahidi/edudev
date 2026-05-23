<?php

return [
    /*
    |--------------------------------------------------------------------------
    | JWT Secret
    |--------------------------------------------------------------------------
    |
    | This secret key is used to sign the stateless JWT tokens. If not set,
    | it will fall back to the application's unique APP_KEY.
    |
    */
    'secret' => env('JWT_SECRET', env('APP_KEY')),
];
