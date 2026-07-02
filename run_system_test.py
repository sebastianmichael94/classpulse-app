import json
import time
import requests

BASE_URL = 'http://127.0.0.1:8000/api'


def main():
    session = requests.Session()

    quiz_payload = {
        'title': 'System Test Quiz',
        'time_limit_minutes': 10,
        'instructions': 'End-to-end validation loop',
        'status': 'DRAFT',
        'questions': [
            {
                'order_index': 1,
                'question_title': 'Math concept',
                'question_type': 'multiple_choice_question',
                'question_text': 'Which option is correct?',
                'interaction_data': {
                    'options': ['A', 'B', 'C'],
                    'correct_index': 1,
                },
            },
            {
                'order_index': 2,
                'question_title': 'Formula check',
                'question_type': 'formula_question',
                'question_text': 'Solve for x',
                'interaction_data': {
                    'variables': {
                        'x': {'min': 1, 'max': 10}
                    }
                },
            },
            {
                'order_index': 3,
                'question_title': 'Essay reflection',
                'question_type': 'essay_question',
                'question_text': 'Explain your reasoning',
                'interaction_data': {},
            },
        ],
    }

    create_response = session.post(f'{BASE_URL}/quizzes/', json=quiz_payload, timeout=10)
    create_response.raise_for_status()
    quiz = create_response.json()
    quiz_id = quiz['id']
    question_ids = [question['id'] for question in quiz.get('questions', [])]

    patch_response = session.patch(f'{BASE_URL}/quizzes/{quiz_id}/', json={'status': 'PUBLISHED'}, timeout=10)
    patch_response.raise_for_status()

    unlock_response = session.post(f'{BASE_URL}/quizzes/unlock/', json={'access_code': quiz['access_code']}, timeout=10)
    unlock_response.raise_for_status()

    for student_name in ['Ada', 'Grace', 'Linus']:
        answers = [
            {'question_id': question_ids[0], 'question_type': 'multiple_choice_question', 'answer': 1},
            {'question_id': question_ids[1], 'question_type': 'formula_question', 'answer': 4},
            {'question_id': question_ids[2], 'question_type': 'essay_question', 'answer': 'The lesson was clear and helpful for understanding the topic.'},
        ]

        submission_response = session.post(
            f'{BASE_URL}/submissions/',
            json={
                'quiz': quiz_id,
                'student_name': student_name,
                'answers': answers,
            },
            timeout=10,
        )
        submission_response.raise_for_status()
        print(f"[{student_name}] submission accepted: {submission_response.json()['score']}/{submission_response.json()['total_possible']}")

    analytics_response = session.get(f'{BASE_URL}/quizzes/{quiz_id}/analytics/', timeout=10)
    analytics_response.raise_for_status()
    analytics = analytics_response.json()

    print('\n=== Word Cloud ===')
    print(json.dumps(analytics.get('word_cloud', []), indent=2))
    print('\n=== Essay Summary ===')
    print(json.dumps(analytics.get('essay_summary', {}), indent=2))


if __name__ == '__main__':
    main()
