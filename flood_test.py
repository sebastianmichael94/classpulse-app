import random
import time

import requests

BASE_URL = "http://127.0.0.1:8000"
API_BASE = f"{BASE_URL}/api"
QUIZ_ACCESS_PIN = "3298"
STUDENT_COUNT = 15
REQUEST_TIMEOUT = 8
DELAY_BETWEEN_SUBMISSIONS_SECONDS = 0.25

VOCABULARY = ["Kafka", "distributed-ledger", "linearizable", "event-driven", "consensus", "bottleneck"]
GIST_TEMPLATES = [
    "We should isolate the {} to ensure strict linearizable ordering.",
    "The primary architectural challenge stems from the {} synchronization delay.",
    "Implementing {} mitigates race conditions across high-concurrency partitions.",
]


def _pick_published_quiz_code(session):
    try:
        response = session.get(f"{API_BASE}/quizzes/", timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
    except requests.RequestException:
        return None

    quizzes = response.json() if isinstance(response.json(), list) else []
    published = [quiz for quiz in quizzes if str(quiz.get("status", "")).upper() == "PUBLISHED" and quiz.get("access_code")]
    return published[0]["access_code"] if published else None


def _unlock_quiz(session, access_code):
    response = session.post(
        f"{API_BASE}/quizzes/unlock/",
        json={"access_code": str(access_code).strip()},
        timeout=REQUEST_TIMEOUT,
    )
    if response.status_code == 200:
        return response.json(), None

    try:
        payload = response.json()
    except ValueError:
        payload = {}
    return None, payload.get("error") or f"HTTP {response.status_code}"


def _build_answer_for_question(question):
    question_type = str(question.get("question_type") or "").strip()
    interaction_data = question.get("interaction_data") or {}

    if question_type in {"Multiple Choice", "multiple_choice_question"}:
        options = interaction_data.get("options") or []
        return random.choice(options) if options else "Option A"

    if question_type in {"True/False", "true_false_question"}:
        return random.choice(["True", "False"])

    if question_type == "Multiple Answers":
        options = interaction_data.get("options") or []
        if not options:
            return []
        count = min(len(options), max(1, random.randint(1, 2)))
        return random.sample(options, count)

    if question_type in {"Essay Question", "essay_question"}:
        return random.choice(GIST_TEMPLATES).format(random.choice(VOCABULARY))

    if question_type in {"Fill In the Blank", "one_word_question", "fill_in_the_blank_question"}:
        return random.choice(VOCABULARY)

    if question_type in {"Fill In Multiple Blanks", "Multiple Dropdowns", "Matching"}:
        return {"slot_1": random.choice(VOCABULARY), "slot_2": random.choice(VOCABULARY)}

    if question_type in {"Formula Question", "formula_question", "Numerical Answer"}:
        return random.randint(1, 100)

    if question_type == "File Upload Question":
        return {"name": "mock_submission.pdf", "size": 1024, "type": "application/pdf"}

    if question_type == "Text (no question)":
        return ""

    return random.choice(VOCABULARY)


def run_e2e_test_suite():
    session = requests.Session()

    print(f"STARTING CLASSPULSE REAL-TIME INGESTION FLOOD AGAINST ACCESS CODE: {QUIZ_ACCESS_PIN}")
    print("=" * 70)

    quiz, unlock_error = _unlock_quiz(session, QUIZ_ACCESS_PIN)
    used_code = QUIZ_ACCESS_PIN

    if not quiz:
        fallback_code = _pick_published_quiz_code(session)
        if fallback_code and fallback_code != QUIZ_ACCESS_PIN:
            print(f"Access code {QUIZ_ACCESS_PIN} did not unlock a published quiz. Retrying with discovered code: {fallback_code}")
            quiz, unlock_error = _unlock_quiz(session, fallback_code)
            used_code = fallback_code

    if not quiz:
        print(f"Unable to unlock quiz. Reason: {unlock_error}")
        print("Tip: publish a quiz first, then re-run this script with the active access code.")
        return

    quiz_id = quiz.get("id")
    questions = quiz.get("questions") or []
    if not quiz_id or not questions:
        print("Unlocked quiz is missing id/questions; cannot continue flood submissions.")
        return

    print(f"Unlocked quiz {quiz_id} using code {used_code}. Questions found: {len(questions)}")

    success_count = 0
    for idx in range(1, STUDENT_COUNT + 1):
        student_name = f"Student_{idx}"

        answers = []
        for question in questions:
            answers.append(
                {
                    "question_id": question.get("id"),
                    "question_type": question.get("question_type"),
                    "answer": _build_answer_for_question(question),
                }
            )

        submission_payload = {
            "quiz": quiz_id,
            "student_name": student_name,
            "answers": answers,
        }

        try:
            response = session.post(f"{API_BASE}/submissions/", json=submission_payload, timeout=REQUEST_TIMEOUT)
            if response.status_code in {200, 201}:
                payload = response.json()
                success_count += 1
                print(
                    f"[OK {idx}/{STUDENT_COUNT}] Accepted {student_name} "
                    f"score={payload.get('score', 0)}/{payload.get('total_possible', 0)}"
                )
            else:
                try:
                    error_payload = response.json()
                except ValueError:
                    error_payload = response.text
                print(f"[FAIL {idx}/{STUDENT_COUNT}] Status={response.status_code} body={error_payload}")
        except requests.RequestException as exc:
            print(f"[DROP {idx}/{STUDENT_COUNT}] Network error for {student_name}: {exc}")

        time.sleep(DELAY_BETWEEN_SUBMISSIONS_SECONDS)

    print("=" * 70)
    print(f"INGESTION FLOOD COMPLETE: {success_count}/{STUDENT_COUNT} submissions accepted")

if __name__ == "__main__":
    run_e2e_test_suite()