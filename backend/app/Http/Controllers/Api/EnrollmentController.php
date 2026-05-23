<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EnrollmentController extends Controller
{
    public function store(Request $request, Course $course): JsonResponse
    {
        abort_unless($request->user()->role === 'trainee', 403);

        $request->user()->enrolledCourses()->syncWithoutDetaching([
            $course->id => ['status' => 'in_progress'],
        ]);

        return response()->json([
            'message' => 'Enrollment created.',
            'course' => $course->load(['module:id,title', 'trainer:id,first_name,last_name']),
        ]);
    }
}
