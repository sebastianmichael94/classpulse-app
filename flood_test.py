import random
import time
import requests

# 🎯 Configuration Settings
BASE_URL = "http://127.0.0.1:8000"     # Base Django server route
ACCESS_CODE = "8943"                   # Target Quiz Access PIN
TOTAL_STUDENTS = 50                    # Number of test cases to generate
UNLOCK_ENDPOINTS = [
    f"{BASE_URL}/api/quizzes/unlock/",
    f"{BASE_URL}/quizzes/unlock/",
]
SUBMISSION_ENDPOINTS = [
    f"{BASE_URL}/api/submissions/",
    f"{BASE_URL}/submissions/",
]

# 📝 Mock Data Pools for Random Generation
FIRST_NAMES = ["Amit", "Neha", "Rohan", "Priya", "Rahul", "Siddharth", "Anjali", "Vikram", "Tanvi", "Aditya"]
LAST_NAMES = ["Sharma", "Verma", "Patel", "Joshi", "Mehta", "Rao", "Nair", "Gupta", "Mishra", "Kulkarni"]

VOCABULARY_WORDS = [
    "Kafka", "scalability", "latency", "distributed", "event-driven", "database", 
    "linearizable", "consistency", "throughput", "caching", "Redis", "PostgreSQL",
    "partitioning", "replication", "broker", "consumer", "producer", "async", "API",
    "microservices", "concurrency", "deadlock", "sharding", "indexes", "architecture"
]

SENTENCE_STRUCTURES = [
    "The core bottleneck is {} which spikes processing latency.",
    "Using {} ensures high throughput and strong decoupling in our system design.",
    "We should optimize {} to handle linearizable consistency guarantees.",
    "Implementing a robust {} model mitigates the high-concurrency race condition.",
    "The distributed cluster handles {} gracefully during a node partition event."
]

def fetch_quiz_details():
    """Hits the unlock endpoint to fetch the quiz payload and its associated questions."""
    for url in UNLOCK_ENDPOINTS:
        try:
            response = requests.post(url, json={"access_code": ACCESS_CODE}, timeout=5)
            if response.status_code == 200:
                print(f"📡 Handshake established via: {url}")
                return response.json()
        except requests.RequestException:
            continue
    return None


def resolve_submission_url():
    """Finds the live submission endpoint registered in Django."""
    probe_payload = {
        "quiz": "00000000-0000-0000-0000-000000000000",
        "student_name": "route-probe",
        "answers": [],
    }

    for url in SUBMISSION_ENDPOINTS:
        try:
            response = requests.post(url, json=probe_payload, timeout=5)
            if response.status_code != 404:
                print(f"📨 Submission channel resolved via: {url}")
                return url
        except requests.RequestException:
            continue

    return None

def generate_payload_answers(questions):
    payload_answers = []
    
    for question in questions:
        q_id = question.get("id")
        q_type = question.get("question_type", "essay_question")
        
        if q_type == "multiple_choice_question":
            options = question.get("interaction_data", {}).get("options", ["A", "B", "C", "D"])
            answer_val = random.choice(options)
        elif q_type == "true_false_question":
            answer_val = random.choice(["True", "False"])
        elif q_type == "formula_question":
            variables = question.get("interaction_data", {}).get("variables", {})
            numeric_candidates = []
            for variable_config in variables.values():
                if isinstance(variable_config, dict):
                    min_value = variable_config.get("min")
                    max_value = variable_config.get("max")
                    if isinstance(min_value, (int, float)) and isinstance(max_value, (int, float)):
                        numeric_candidates.append((min_value + max_value) / 2)

            answer_val = round(random.choice(numeric_candidates), 2) if numeric_candidates else random.randint(1, 100)
        elif q_type in {"one_word_question", "fill_in_the_blank_question"}:
            answer_val = random.choice(VOCABULARY_WORDS)
        else:
            words_used = random.sample(VOCABULARY_WORDS, random.randint(2, 4))
            answer_val = random.choice(SENTENCE_STRUCTURES).format(" and ".join(words_used))
            
        payload_answers.append({
            "question_id": q_id,
            "question_type": q_type,
            "answer": answer_val
        })
        
    return payload_answers

def run_simulation():
    print(f"🔍 Fetching active questions for Access Code {ACCESS_CODE}...")
    quiz_data = fetch_quiz_details()
    
    if not quiz_data or "id" not in quiz_data:
        print("🛑 Aborting simulation. Could not resolve the quiz structure or access pin.")
        return

    quiz_id = quiz_data["id"]
    questions = quiz_data.get("questions", [])

    if not questions:
        print("🛑 Aborting simulation. Quiz payload returned no questions, so submissions would be invalid.")
        return

    print(f"🎯 Active Quiz Identity Resolved: {quiz_id}")
    print(f"👥 Spawning {TOTAL_STUDENTS} unique student submissions...")
    print("-" * 60)

    success_count = 0
    active_submit_url = resolve_submission_url()

    if not active_submit_url:
        print("🛑 Aborting simulation. Could not resolve a live submission endpoint from the Django router.")
        return
        
    for i in range(1, TOTAL_STUDENTS + 1):
        student_name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        payload_answers = generate_payload_answers(questions)

        payload = {
            "quiz": quiz_id,
            "student_name": student_name,
            "answers": payload_answers
        }
        
        try:
            response = requests.post(active_submit_url, json=payload, timeout=5)
            
            if response.status_code in [200, 201]:
                print(f"[✅ {i}/{TOTAL_STUDENTS}] Submitted successfully: {student_name}")
                success_count += 1
            else:
                print(f"[❌ {i}/{TOTAL_STUDENTS}] Refused at {active_submit_url}. Status code: {response.status_code}")
                
        except requests.exceptions.RequestException as e:
            print(f"[💥 {i}/{TOTAL_STUDENTS}] Broken line interface connection: {e}")
            
        time.sleep(0.3)
        
    print("-" * 60)
    print(f"🏁 Simulation complete! {success_count}/{TOTAL_STUDENTS} data arrays successfully committed to Django state.")

if __name__ == "__main__":
    run_simulation()