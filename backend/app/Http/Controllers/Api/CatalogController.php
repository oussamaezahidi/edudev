<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CatalogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Course::query()
            ->withCount(['trainees', 'lessons', 'modules'])
            ->with(['module:id,title', 'trainer:id,name,specialty']);

        if ($request->filled('module_id')) {
            $query->where('module_id', $request->integer('module_id'));
        }

        if ($request->filled('q')) {
            $query->where('title', 'like', '%'.$request->string('q').'%');
        }

        return response()->json($query->orderBy('title')->get());
    }

    public function show(Course $course): JsonResponse
    {
        return response()->json($course->load([
            'module:id,title,description',
            'trainer:id,name,specialty,bio',
            'lessons:id,course_id,title,type,position,duration_minutes,published',
            'quizzes.questions:id,quiz_id,prompt,option_a,option_b,option_c,option_d',
        ])->loadCount('trainees'));
    }
}
