<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Certificate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CertificateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'trainee', 403);

        return response()->json(
            Certificate::query()
                ->with(['course:id,title', 'course.module:id,title', 'course.trainer:id,first_name,last_name'])
                ->where('user_id', $request->user()->id)
                ->latest('issued_at')
                ->get()
        );
    }
}
