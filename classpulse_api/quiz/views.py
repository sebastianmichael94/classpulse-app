import re
import json
import os
import uuid
import math
import html
import base64
from datetime import timedelta
from anthropic import Anthropic
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password, check_password
from django.db import transaction
from django.db.models import Avg, Max, Min, F
from django.utils import timezone
from django.core.files.storage import default_storage
from rest_framework import viewsets, status
from rest_framework.authtoken.models import Token
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from .authentication import BearerOrTokenAuthentication
from .models import Quiz, Question, Submission, CustomAnalyticsPrompt, PeerResponse, UserProfile
from .serializers import (
    QuizSerializer,
    SubmissionSerializer,
    SubmissionCreateSerializer,
    PeerResponseSerializer,
    RegisterSerializer,
    LoginSerializer,
)
from .choice_schema import (
    build_choice_texts,
    choice_badge_for_index,
    find_choice_index,
    normalize_choice_list,
    normalize_selected_choice_indices,
)
from .matching_schema import (
    normalize_correct_mapping,
    normalize_matching_answer,
    normalize_matching_items,
)


def read_local_env_value(key_name):
    key = str(key_name or '').strip()
    if not key:
        return ''

    # Support local .env at API root and project root so runtime is stable across terminals.
    candidate_paths = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env')),
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '.env')),
    ]

    for env_path in candidate_paths:
        if not os.path.exists(env_path):
            continue

        try:
            with open(env_path, 'r', encoding='utf-8') as env_file:
                for raw_line in env_file:
                    line = raw_line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue

                    left, right = line.split('=', 1)
                    left_key = left.strip().lstrip('\ufeff')
                    if left_key != key:
                        continue

                    value = right.strip().strip('"').strip("'")
                    if value:
                        return value
        except OSError:
            continue

    return ''


def resolve_setting_value(key_name, default_value=''):
    from_env = str(os.environ.get(key_name) or '').strip()
    if from_env:
        return from_env

    from_file = read_local_env_value(key_name)
    if from_file:
        return from_file

    return str(default_value or '').strip()


def get_anthropic_client():
    api_key = (
        resolve_setting_value('ANTHROPIC_API_KEY')
        or resolve_setting_value('CLAUDE_API_KEY')
        or resolve_setting_value('ANTHROPIC_KEY')
    )
    if not api_key:
        return None

    try:
        # Keep initialization on the supported Anthropic constructor signature only.
        return Anthropic(api_key=api_key)
    except Exception as exc:
        print(f"Claude API Pipeline Error: Anthropic client initialization failed: {str(exc)}")
        return None


def get_anthropic_model():
    return resolve_setting_value('ANTHROPIC_MODEL', 'claude-sonnet-5')


def parse_json_object(text_value):
    raw = str(text_value or '').strip()
    if not raw:
        return None

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        return None

    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def extract_message_text(message_obj):
    content_blocks = getattr(message_obj, 'content', None) or []
    text_parts = []

    for block in content_blocks:
        block_text = getattr(block, 'text', None)
        if block_text:
            text_parts.append(str(block_text))
            continue

        if isinstance(block, dict):
            dict_text = block.get('text')
            if dict_text:
                text_parts.append(str(dict_text))

    return '\n'.join(part for part in text_parts if str(part).strip()).strip()

STOP_WORDS = {
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have',
    'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'this',
    'to', 'was', 'were', 'will', 'with', 'you', 'your', 'about', 'can', 'could', 'more', 'than',
    'very', 'not', 'what', 'when', 'which', 'who', 'why', 'how'
}

QUESTION_TYPE_ALIAS_MAP = {
    'multiple_choice_question': 'Multiple Choice',
    'true_false_question': 'True/False',
    'matching_question': 'Matching',
    'fill_in_the_blank_question': 'Fill In the Blank',
    'one_word_question': 'Fill In the Blank',
    'essay_question': 'Essay',
    'Essay Question': 'Essay',
}


def normalize_question_type(question_type):
    if not question_type:
        return 'Essay'
    normalized = str(question_type).strip()
    return QUESTION_TYPE_ALIAS_MAP.get(normalized, normalized)


def index_to_choice_label(index_value):
    try:
        numeric_index = int(index_value)
    except (TypeError, ValueError):
        return None

    if numeric_index < 0:
        return None

    return chr(ord('A') + numeric_index)


TEXT_BASED_TYPES = {
    'Essay',
    'Fill In the Blank',
}

SHORT_TEXT_TYPES = {
    'Essay',
    'Fill In the Blank',
}

ESSAY_ANALYTICS_TYPES = {
    'Essay',
}

TEXT_ANALYTICS_TYPES = {
    'Essay',
    'Fill In the Blank',
}


def extract_textual_answer(answer_value):
    if isinstance(answer_value, str):
        cleaned = answer_value.strip()
        return cleaned if cleaned else None

    if isinstance(answer_value, dict):
        joined = [str(value).strip() for value in answer_value.values() if str(value).strip()]
        return ' | '.join(joined) if joined else None

    return None


def collect_text_fragments(answer_value):
    fragments = []

    if isinstance(answer_value, str):
        cleaned = answer_value.strip()
        if cleaned:
            fragments.append(cleaned)
        return fragments

    if isinstance(answer_value, dict):
        for value in answer_value.values():
            fragments.extend(collect_text_fragments(value))
        return fragments

    if isinstance(answer_value, list):
        for item in answer_value:
            fragments.extend(collect_text_fragments(item))
        return fragments

    if isinstance(answer_value, (int, float, bool)):
        return [str(answer_value)]

    return fragments


def extract_essay_texts_from_submission(submission, question_lookup=None):
    answer_items = submission.answers if isinstance(submission.answers, list) else []
    essay_texts = []
    lookup = question_lookup or {}

    for answer in answer_items:
        if not isinstance(answer, dict):
            continue

        question = lookup.get(answer.get('question_id'))
        question_type = normalize_question_type(
            answer.get('question_type') or (question.question_type if question else None)
        )
        if question_type not in ESSAY_ANALYTICS_TYPES:
            continue

        answer_value = answer.get('answer')
        essay_texts.extend([fragment for fragment in collect_text_fragments(answer_value) if fragment])

    return essay_texts


def extract_analysis_texts_from_submission(submission, question_lookup=None):
    answer_items = submission.answers if isinstance(submission.answers, list) else []
    text_items = []
    lookup = question_lookup or {}

    for answer in answer_items:
        if not isinstance(answer, dict):
            continue

        question = lookup.get(answer.get('question_id'))
        question_type = normalize_question_type(
            answer.get('question_type') or (question.question_type if question else None)
        )
        if question_type not in TEXT_ANALYTICS_TYPES:
            continue

        answer_value = answer.get('answer')
        text_items.extend([fragment for fragment in collect_text_fragments(answer_value) if fragment])

    return text_items


def extract_access_pin(payload):
    if payload is None:
        return ''

    for key in ('pin', 'quiz_pin', 'access_code'):
        raw_value = payload.get(key)
        normalized = str(raw_value or '').strip()
        if normalized:
            return normalized

    return ''


def normalize_security_answer(raw_value):
    return str(raw_value or '').strip().lower()


def enforce_quiz_runtime_gate(quiz):
    if quiz.status == 'READY':
        return False, "This quiz has not started yet. Please wait for your instructor to start it."

    if quiz.status == 'ACTIVE':
        if quiz.started_at:
            elapsed_seconds = (timezone.now() - quiz.started_at).total_seconds()
            if elapsed_seconds > (quiz.duration_minutes * 60):
                quiz.status = 'COMPLETED'
                quiz.save(update_fields=['status'])
                return False, 'This quiz is closed.'
        return True, ''

    if quiz.status == 'COMPLETED':
        return False, 'This quiz is closed.'

    return False, 'This quiz is not available right now.'


def build_student_context(quiz):
    lines = []
    question_lookup = {question.id: question for question in quiz.questions.all()}
    for submission in quiz.submissions.all():
        text_items = extract_analysis_texts_from_submission(submission, question_lookup)
        for text_item in text_items:
            lines.append(f"{submission.student_name}: {text_item}")

    if not lines:
        return 'No text-based student answers have been submitted yet.'

    context = '\n'.join(lines)
    return context[:18000]


def extract_essay_texts_from_quiz(quiz):
    texts = []
    question_lookup = {question.id: question for question in quiz.questions.all()}
    for submission in quiz.submissions.all():
        texts.extend(extract_analysis_texts_from_submission(submission, question_lookup))

    if not texts:
        # Fallback: use any answer fragments so AI cards can still reflect live submission content.
        for submission in quiz.submissions.all():
            for answer in submission.answers if isinstance(submission.answers, list) else []:
                if not isinstance(answer, dict):
                    continue
                texts.extend([fragment for fragment in collect_text_fragments(answer.get('answer')) if fragment])

    return [str(text).strip() for text in texts if str(text).strip()]


def build_word_counts_from_texts(texts):
    word_counts = {}
    for text in texts:
        if not text:
            continue

        for word in re.findall(r"[A-Za-z0-9]+", str(text).lower()):
            cleaned = word.strip()
            if not cleaned:
                continue

            # Keep short numeric codes (e.g., MCQ index values), but filter trivial alpha tokens.
            if cleaned.isdigit() or (len(cleaned) > 2 and cleaned not in STOP_WORDS):
                word_counts[cleaned] = word_counts.get(cleaned, 0) + 1

    return word_counts


def format_word_cloud_data(word_counts, limit=30):
    if not isinstance(word_counts, dict):
        return []

    normalized_items = []
    for word, count in word_counts.items():
        token = str(word or '').strip().lower()
        if not token:
            continue

        try:
            numeric_count = int(round(float(count)))
        except (TypeError, ValueError):
            continue

        if numeric_count <= 0:
            continue

        normalized_items.append((token, numeric_count))

    normalized_items.sort(key=lambda item: (-item[1], item[0]))
    return [
        {'text': token, 'value': numeric_count}
        for token, numeric_count in normalized_items[:max(1, int(limit or 30))]
    ]


def build_summary_insights(word_counts):
    ranked_terms = [(word, count) for word, count in sorted(word_counts.items(), key=lambda item: item[1], reverse=True)[:4]]
    top_terms = [word for word, _ in ranked_terms[:2]]
    total_mentions = sum(max(0, int(count)) for _, count in ranked_terms)

    if not ranked_terms:
        return [
            'Student responses are too sparse to establish a stable understanding trend yet.',
            'Current signals are fragmented, so no dominant misconception cluster is reliable yet.',
            'Collect a few additional short responses to generate an evidence-based summary.',
        ]

    strongest_term, strongest_count = ranked_terms[0]
    secondary_terms = ', '.join(top_terms[1:]) if len(top_terms) > 1 else strongest_term
    concentration = (strongest_count / total_mentions) if total_mentions else 0
    concentration_note = 'highly concentrated around one idea' if concentration >= 0.55 else 'distributed across multiple ideas'

    return [
        f"Most frequent idea right now is '{strongest_term}' ({strongest_count} mentions).",
        f"Secondary pattern shows attention around {secondary_terms}.",
        f"Overall language pattern is {concentration_note} (top-term share: {int(round(concentration * 100))}%).",
    ]


POSITIVE_MOOD_TERMS = {'happy', 'confident', 'clear', 'excited', 'good', 'great', 'understand', 'understood', 'ready'}
NEGATIVE_MOOD_TERMS = {'sad', 'tired', 'stressed', 'confused', 'lost', 'anxious', 'overwhelmed', 'unclear', 'frustrated'}


def build_local_prompt_response(prompt_text, answers):
    normalized_prompt = str(prompt_text or '').strip() or 'the submitted responses'
    fragments = [str(item).strip() for item in (answers or []) if str(item).strip()]
    word_counts = build_word_counts_from_texts(fragments)
    top_terms = [word for word, _ in sorted(word_counts.items(), key=lambda item: item[1], reverse=True)[:3]]
    focus_terms = ', '.join(top_terms[:2]) if top_terms else 'core concept language'

    if fragments:
        breakdown = (
            f"Students are showing partial understanding around {focus_terms}, "
            "but several responses remain surface-level or incomplete."
        )
        recommendation = (
            "In the next two minutes, restate the key idea in one sentence, then contrast a correct and almost-correct example "
            "before cold-calling one student to explain the difference."
        )
    else:
        breakdown = (
            "There are not enough student responses yet to identify a stable understanding pattern or misconception cluster."
        )
        recommendation = (
            "Run a 20-second comprehension check now, then immediately clarify one target concept before proceeding."
        )

    topic_hint = normalized_prompt[:90]
    if top_terms:
        follow_up = (
            f"Multiple-choice check: Which statement best captures today's idea about {topic_hint}?\n"
            f"A) It mainly depends on {top_terms[0]}\n"
            f"B) It mainly depends on {top_terms[1] if len(top_terms) > 1 else top_terms[0]}\n"
            "C) It requires combining both ideas in sequence\n"
            "D) None of the above"
        )
    else:
        follow_up = (
            f"Short-answer check: In one sentence, explain the main idea of {topic_hint} and give one concrete example."
        )

    return format_professor_prompt_response(breakdown, recommendation, follow_up)


def build_local_chat_response(prompt_text, answers, active_question_text=''):
    normalized_prompt = str(prompt_text or '').strip() or 'Please summarize current student feedback.'
    fragments = [str(item).strip() for item in (answers or []) if str(item).strip()]
    word_counts = build_word_counts_from_texts(fragments)
    top_terms = [word for word, _ in sorted(word_counts.items(), key=lambda item: item[1], reverse=True)[:4]]

    if fragments:
        context_line = f"I reviewed {len(fragments)} student responses"
        if top_terms:
            context_line += f" and the strongest recurring terms are {', '.join(top_terms[:3])}."
        else:
            context_line += '. '
        return (
            f"{context_line} Based on your question, {normalized_prompt}\n\n"
            "Direct take: students are showing mixed depth right now, so anchor the next step in one concrete example, "
            "then ask for a short justification to confirm understanding."
        ).strip()

    active_hint = str(active_question_text or '').strip()
    if active_hint:
        return (
            f"I do not have enough student text responses yet to answer this confidently. "
            f"Given your question ({normalized_prompt}), run a quick one-sentence pulse check on this prompt context: {active_hint[:180]}"
        )

    return (
        f"I do not have enough student text responses yet to answer this confidently. "
        f"For your question ({normalized_prompt}), collect 3-5 short responses first, then I can give a direct interpretation."
    )


def strip_developer_artifacts(text_value):
    text = str(text_value or '').strip()
    if not text:
        return ''

    patterns = [
        r"Local insight mode analyzed[^.]*\.\s*",
        r"Claude API Pipeline Error:[^\n]*",
        r"RAW CORE ANALYTICS ENGINE DATA INCOMING:[^\n]*",
        r"DEBUG:[^\n]*",
    ]

    for pattern in patterns:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE)

    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def format_professor_prompt_response(breakdown, recommendation, follow_up):
    clean_breakdown = strip_developer_artifacts(breakdown) or 'Submission patterns are still emerging.'
    clean_recommendation = strip_developer_artifacts(recommendation) or 'Pause for a quick concept check and reteach one key point.'
    clean_follow_up = strip_developer_artifacts(follow_up) or 'Ask one short-answer question to verify understanding.'

    return (
        "📊 Submission Breakdown:\n"
        f"{clean_breakdown}\n\n"
        "💡 Immediate Recommendation:\n"
        f"{clean_recommendation}\n\n"
        "🎯 Suggested Follow-Up Question:\n"
        f"{clean_follow_up}"
    )


def parse_professor_response_sections(raw_text):
    text = strip_developer_artifacts(raw_text)
    if not text:
        return {
            'breakdown': '',
            'recommendation': '',
            'follow_up': '',
        }

    parsed_json = parse_json_object(text)
    if isinstance(parsed_json, dict):
        return {
            'breakdown': str(
                parsed_json.get('submission_breakdown')
                or parsed_json.get('breakdown')
                or parsed_json.get('submissionSummary')
                or ''
            ).strip(),
            'recommendation': str(
                parsed_json.get('immediate_recommendation')
                or parsed_json.get('recommendation')
                or parsed_json.get('action')
                or ''
            ).strip(),
            'follow_up': str(
                parsed_json.get('suggested_follow_up_question')
                or parsed_json.get('follow_up_question')
                or parsed_json.get('question')
                or ''
            ).strip(),
        }

    breakdown_match = re.search(
        r"(?:📊\s*)?Submission Breakdown:\s*([\s\S]*?)(?=(?:💡\s*)?Immediate Recommendation:|$)",
        text,
        flags=re.IGNORECASE,
    )
    recommendation_match = re.search(
        r"(?:💡\s*)?Immediate Recommendation:\s*([\s\S]*?)(?=(?:🎯\s*)?Suggested Follow-Up Question:|$)",
        text,
        flags=re.IGNORECASE,
    )
    follow_up_match = re.search(
        r"(?:🎯\s*)?Suggested Follow-Up Question:\s*([\s\S]*)$",
        text,
        flags=re.IGNORECASE,
    )

    return {
        'breakdown': (breakdown_match.group(1).strip() if breakdown_match else ''),
        'recommendation': (recommendation_match.group(1).strip() if recommendation_match else ''),
        'follow_up': (follow_up_match.group(1).strip() if follow_up_match else ''),
    }


def build_word_cloud_image_data_uri(word_counts, question_seed=''):
    if not isinstance(word_counts, dict) or not word_counts:
        return ''

    ranked_terms = [
        (str(word).strip(), int(count))
        for word, count in sorted(word_counts.items(), key=lambda item: item[1], reverse=True)
        if str(word).strip() and int(count) > 0
    ][:36]

    if not ranked_terms:
        return ''

    width = 1365
    height = 768
    outer_padding = 22
    inner_rx = 58
    inner_x = outer_padding
    inner_y = outer_padding
    inner_w = width - (outer_padding * 2)
    inner_h = height - (outer_padding * 2)
    padding = 24
    palette = ['#4b1d88', '#2a4f9e', '#2f6c2d', '#8c4f2e', '#9a2d88', '#255b7c', '#6d2525', '#7d7a21']

    max_count = max(count for _, count in ranked_terms)
    min_count = min(count for _, count in ranked_terms)
    has_count_variance = max_count > min_count
    spread = max_count - min_count

    boxes = []
    words_svg = []

    def overlaps(box_a, box_b):
        return not (
            box_a['x2'] < box_b['x1']
            or box_a['x1'] > box_b['x2']
            or box_a['y2'] < box_b['y1']
            or box_a['y1'] > box_b['y2']
        )

    def estimate_text_box(center_x, baseline_y, font_size, word):
        text_w = max(24, int(font_size * 0.56 * len(word)))
        top = int(baseline_y - (font_size * 0.82))
        bottom = int(baseline_y + (font_size * 0.26))
        return {
            'x1': int(center_x - (text_w / 2) - 8),
            'x2': int(center_x + (text_w / 2) + 8),
            'y1': top - 6,
            'y2': bottom + 6,
        }

    def within_inner_box(candidate):
        return (
            candidate['x1'] >= (inner_x + padding)
            and candidate['x2'] <= (inner_x + inner_w - padding)
            and candidate['y1'] >= (inner_y + padding)
            and candidate['y2'] <= (inner_y + inner_h - padding)
        )

    center_x = int(width / 2)
    center_y = int(height / 2)

    # Place the highest-weight term exactly at the center first.
    center_word, center_count = ranked_terms[0]
    if has_count_variance:
        center_ratio = (center_count - min_count) / spread
        center_font_size = int(round(108 + center_ratio * 28))
    else:
        # Uniform frequencies (e.g., all words count=1) should render at equal visual weight.
        center_font_size = 42
    center_box = estimate_text_box(center_x, center_y + int(center_font_size * 0.18), center_font_size, center_word)
    boxes.append(center_box)
    words_svg.append(
        f'<text x="{center_x}" y="{center_y + int(center_font_size * 0.18)}" text-anchor="middle" '
        f'font-size="{center_font_size}" font-weight="760" '
        f'fill="#3b1f76" font-family="Segoe UI, Tahoma, sans-serif">{html.escape(center_word)}</text>'
    )

    for index, (word, count) in enumerate(ranked_terms[1:], start=1):
        if has_count_variance:
            ratio = (count - min_count) / spread
            font_size = int(round(26 + ratio * 70))
        else:
            ratio = 0.5
            font_size = 42

        hash_source = f"{question_seed}-{word}-{count}-{index}"
        hash_value = sum(ord(ch) for ch in hash_source)
        color = palette[hash_value % len(palette)]

        placed = False
        base_angle = (hash_value % 360) * (math.pi / 180)
        for ring in range(1, 15):
            radius = 86 + (ring * 34)
            spoke_count = 28 + ring
            for spoke in range(spoke_count):
                angle = base_angle + (spoke * ((math.pi * 2) / spoke_count))
                candidate_x = int(center_x + math.cos(angle) * radius)
                candidate_y = int(center_y + math.sin(angle) * radius + (font_size * 0.18))
                candidate = estimate_text_box(candidate_x, candidate_y, font_size, word)

                if not within_inner_box(candidate):
                    continue

                if any(overlaps(candidate, existing) for existing in boxes):
                    continue

                boxes.append(candidate)
                words_svg.append(
                    f'<text x="{candidate_x}" y="{candidate_y}" text-anchor="middle" '
                    f'font-size="{font_size}" font-weight="{500 + int(ratio * 220)}" '
                    f'fill="{color}" font-family="Segoe UI, Tahoma, sans-serif">{html.escape(word)}</text>'
                )
                placed = True
                break
            if placed:
                break

        if not placed:
            # Final dense scan fallback to keep terms non-overlapping but visible when possible.
            for y in range(inner_y + 70, inner_y + inner_h - 60, 28):
                if placed:
                    break
                for x in range(inner_x + 90, inner_x + inner_w - 90, 34):
                    candidate = estimate_text_box(x, y, font_size, word)
                    if not within_inner_box(candidate):
                        continue
                    if any(overlaps(candidate, existing) for existing in boxes):
                        continue
                    boxes.append(candidate)
                    words_svg.append(
                        f'<text x="{x}" y="{y}" text-anchor="middle" '
                        f'font-size="{font_size}" font-weight="{500 + int(ratio * 220)}" '
                        f'fill="{color}" font-family="Segoe UI, Tahoma, sans-serif">{html.escape(word)}</text>'
                    )
                    placed = True
                    break

    if not words_svg:
        return ''

    svg_markup = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0%" stop-color="#1780c2"/><stop offset="100%" stop-color="#0d5f97"/>'
        '</linearGradient></defs>'
        '<rect x="0" y="0" width="100%" height="100%" fill="url(#bg)"/>'
        f'<rect x="{inner_x}" y="{inner_y}" width="{inner_w}" height="{inner_h}" rx="{inner_rx}" fill="#d1d5db"/>'
        f"{''.join(words_svg)}"
        '</svg>'
    )

    encoded = base64.b64encode(svg_markup.encode('utf-8')).decode('ascii')
    return f'data:image/svg+xml;base64,{encoded}'


def extract_essay_answers_for_pin(pin_param):
    submissions = Submission.objects.filter(quiz__access_code=pin_param).order_by('-submitted_at')
    essay_answers = []

    for submission in submissions:
        answer_items = submission.answers if isinstance(submission.answers, list) else []
        for answer in answer_items:
            if not isinstance(answer, dict):
                continue

            question_type = normalize_question_type(answer.get('question_type'))
            if question_type != 'Essay':
                continue

            answer_value = answer.get('answer')
            fragments = collect_text_fragments(answer_value)
            for fragment in fragments:
                cleaned = str(fragment).strip()
                if cleaned:
                    essay_answers.append(cleaned)

    return essay_answers


def answer_matches_question_id(answer, question_id):
    if not question_id:
        return True

    answer_question_id = answer.get('question_id')
    if answer_question_id is None:
        return False

    return str(answer_question_id) == str(question_id)


def parse_analytics_action(raw_action):
    action = str(raw_action or '').strip().lower()
    valid_actions = {'overview', 'generate_cloud', 'generate_summary', 'generate_all'}
    if action in valid_actions:
        return action
    return 'overview'


def extract_prompt_context_answers_for_pin(pin_param, question_id=None):
    """Build prompt context from essay answers first, then broader text answers, then any textual fragments."""
    submissions = Submission.objects.filter(quiz__access_code=pin_param).order_by('-submitted_at')

    preferred_answers = []
    text_answers = []
    any_text_answers = []

    for submission in submissions:
        answer_items = submission.answers if isinstance(submission.answers, list) else []
        for answer in answer_items:
            if not isinstance(answer, dict):
                continue

            if not answer_matches_question_id(answer, question_id):
                continue

            fragments = [str(fragment).strip() for fragment in collect_text_fragments(answer.get('answer')) if str(fragment).strip()]
            if not fragments:
                continue

            question_type = normalize_question_type(answer.get('question_type'))

            if question_type in ESSAY_ANALYTICS_TYPES:
                preferred_answers.extend(fragments)

            if question_type in TEXT_ANALYTICS_TYPES:
                text_answers.extend(fragments)

            any_text_answers.extend(fragments)

    if preferred_answers:
        return preferred_answers
    if text_answers:
        return text_answers
    return any_text_answers


def extract_text_answers_for_pin(pin_param, question_id=None):
    submissions = Submission.objects.filter(quiz__access_code=pin_param).order_by('-submitted_at')
    text_answers = []

    for submission in submissions:
        answer_items = submission.answers if isinstance(submission.answers, list) else []
        for answer in answer_items:
            if not isinstance(answer, dict):
                continue

            if not answer_matches_question_id(answer, question_id):
                continue

            question_type = normalize_question_type(answer.get('question_type'))
            if question_type not in TEXT_ANALYTICS_TYPES:
                continue

            answer_value = answer.get('answer')
            for fragment in collect_text_fragments(answer_value):
                cleaned = str(fragment).strip()
                if cleaned:
                    text_answers.append(cleaned)

    return text_answers


def generate_claude_dashboard_insights(essay_answers, force_model=False):
    source_answers = essay_answers or []
    word_counts = build_word_counts_from_texts(source_answers)
    word_cloud_data_fallback = format_word_cloud_data(word_counts, limit=30)
    insights_fallback = build_summary_insights(word_counts)
    top_terms = [word for word, _ in sorted(word_counts.items(), key=lambda item: item[1], reverse=True)[:4]]
    if top_terms:
        misconceptions_fallback = (
            f"Current response signals are centered on {', '.join(top_terms[:2])}; "
            "no dominant misconception pattern is stable yet."
        )
        key_themes_fallback = ', '.join(top_terms)
    else:
        misconceptions_fallback = 'Not enough textual response data to infer stable misconceptions yet.'
        key_themes_fallback = 'Awaiting additional student response data.'

    if not source_answers and not force_model:
        return {
            'gist_list': insights_fallback,
            'misconceptions': misconceptions_fallback,
            'key_themes': key_themes_fallback,
            'word_counts': word_counts,
            'word_cloud_data': word_cloud_data_fallback,
            'ai_source': 'fallback',
        }

    context_payload = source_answers if source_answers else ['No text responses available yet. Generate best-effort educator guidance.']
    prompt_content = (
        f"Analyze these student short-answer submissions for a real-time lecture insight dashboard: {list(context_payload)}. "
        "Respond ONLY with a raw, valid JSON object containing exactly these keys: 'gist_list' "
        "(a list of 3-4 distinct string bullet points summarizing key insights), 'misconceptions' "
        "(a single string highlighting the most common student error), and 'key_themes' "
        "(a single string listing overarching academic topics), and 'word_cloud_data' "
        "(a list of up to 30 objects sorted highest-to-lowest frequency exactly like {'text':'term','value':number})."
    )

    anthropic_client = get_anthropic_client()
    if anthropic_client is None:
        print('Claude API Pipeline Error: Missing ANTHROPIC_API_KEY in backend process environment.')
        return {
            'gist_list': insights_fallback,
            'gistList': insights_fallback,
            'misconceptions': misconceptions_fallback,
            'key_themes': key_themes_fallback,
            'word_counts': word_counts,
            'word_cloud_data': word_cloud_data_fallback,
            'ai_source': 'fallback',
        }

    try:
        message = anthropic_client.messages.create(
            model=get_anthropic_model(),
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt_content}]
        )
        raw_text = extract_message_text(message)
        ai_data = parse_json_object(raw_text)

        if not isinstance(ai_data, dict):
            raise ValueError('Claude returned non-JSON insights payload.')

        gist_list = ai_data.get('gist_list')
        if not isinstance(gist_list, list):
            gist_list = ai_data.get('gistList')
        gist_list = [str(item).strip() for item in (gist_list or []) if str(item).strip()][:4]
        if not gist_list:
            gist_list = insights_fallback

        misconceptions = str(ai_data.get('misconceptions') or '').strip() or misconceptions_fallback
        key_themes = str(ai_data.get('key_themes') or '').strip() or key_themes_fallback

        raw_word_cloud_data = ai_data.get('word_cloud_data')
        if not isinstance(raw_word_cloud_data, list):
            raw_word_cloud_data = ai_data.get('word_weights') if isinstance(ai_data.get('word_weights'), list) else []

        claude_word_counts = {}
        for item in raw_word_cloud_data[:30]:
            if not isinstance(item, dict):
                continue

            term = str(item.get('text') or item.get('word') or '').strip().lower()
            if not term:
                continue

            raw_weight = item.get('value', item.get('weight', item.get('count', 0)))
            try:
                numeric_weight = int(round(float(raw_weight)))
            except (TypeError, ValueError):
                continue

            if numeric_weight <= 0:
                continue
            claude_word_counts[term] = claude_word_counts.get(term, 0) + max(1, numeric_weight)

        resolved_word_counts = claude_word_counts or word_counts
        resolved_word_cloud_data = format_word_cloud_data(resolved_word_counts, limit=30)

        return {
            'gist_list': gist_list,
            'gistList': gist_list,
            'misconceptions': misconceptions,
            'key_themes': key_themes,
            'word_counts': resolved_word_counts,
            'word_cloud_data': resolved_word_cloud_data,
            'ai_source': 'claude',
        }
    except Exception as e:
        print(f"Claude API Pipeline Error: {str(e)}")
        return {
            'gist_list': insights_fallback,
            'gistList': insights_fallback,
            'misconceptions': misconceptions_fallback,
            'key_themes': key_themes_fallback,
            'word_counts': word_counts,
            'word_cloud_data': word_cloud_data_fallback,
            'ai_source': 'fallback',
        }


CLAUDE_PEDAGOGICAL_SYSTEM_PROMPT = """
You are an expert pedagogical assistant and data analyst for a real-time lecture platform named ClassPulse.
Your job is to look at a classroom question, a set of real-time student responses, and an instructor's explicit question about those responses, and provide highly accurate, contextual, and professional advice.

CRITICAL INSTRUCTIONS:
1. ADAPT TO THE DATA TYPE: Inspect the question title and the student answers. If the question is an emotional check-in, feedback loop, or open-ended sentiment check (e.g., terms like "mood", "feeling", "how are you"), do NOT treat responses as right or wrong. Analyze the emotional distribution (e.g., 75% positive/exuberant/joyful, 25% sad) and summarize the collective energy of the room.
2. IF IT IS AN ACADEMIC QUIZ: Only then evaluate conceptual alignment, identifying genuine misconceptions or surface-level knowledge gaps.
3. NEVER treat literal strings or individual adjectives as technical concepts unless they explicitly match an engineering or factual domain.
4. DO NOT reference developer jargon or placeholder modes. Speak directly to the instructor as an elite teaching assistant.

Strictly format your response into these exact Markdown headers:
📊 Submission Breakdown:
[Provide a clear, context-aware executive summary of what the student data actually represents]

💡 Immediate Recommendation:
[Provide a highly tactical, 1-2 sentence recommendation for the next minute of class based on the data]

🎯 Suggested Follow-Up Question:
[Provide a contextually relevant question for the instructor to ask next]
"""


CLAUDE_CONVERSATIONAL_SYSTEM_PROMPT = """
You are a direct, conversational AI Assistant helping Dr. Reshma Menon interpret live lecture feedback metrics for ClassPulse.
Analyze the student response text data provided to you, and answer the instructor's explicit query directly, naturally, and professionally without using rigid templates, forced headers, or pre-formatted choice options. Just answer her question directly using the data context.
"""


def parse_boolean_flag(raw_value, default=False):
    if isinstance(raw_value, bool):
        return raw_value

    normalized = str(raw_value or '').strip().lower()
    if not normalized:
        return bool(default)

    return normalized in {'1', 'true', 'yes', 'on'}


def build_claude_student_context(active_question_text, student_responses):
    clean_question = str(active_question_text or '').strip()
    clean_responses = [str(item).strip() for item in (student_responses or []) if str(item).strip()]

    response_lines = [f"{index + 1}. {item}" for index, item in enumerate(clean_responses)]
    responses_block = '\n'.join(response_lines) if response_lines else 'No student text responses available yet.'

    if clean_question:
        return f"Active Question Context:\n{clean_question}\n\nStudent Responses:\n{responses_block}"

    return f"Student Responses:\n{responses_block}"


def generate_claude_summary_response(user_prompt, essay_answers, active_question_text=''):
    def build_prompt_fallback_response(prompt_text, answers, reason=''):
        return build_local_prompt_response(prompt_text, answers)

    prompt_lower = str(user_prompt or '').lower()
    newest_intent = any(term in prompt_lower for term in ['newest', 'latest', 'most recent', 'recent submission'])
    context_window = 8 if newest_intent else 80
    context_items = essay_answers[:context_window]
    normalized_question_text = str(active_question_text or '').strip() or 'No active question text provided.'
    normalized_student_responses = context_items if context_items else ['No student text responses available yet.']

    claude_payload = [
        {
            'active_question_text': normalized_question_text,
            'student_text_responses': normalized_student_responses,
            'professor_query': str(user_prompt or '').strip(),
        }
    ]

    prompt_content = (
        "Use the following classroom analysis payload and answer the instructor with the required markdown headers.\n"
        f"Payload: {json.dumps(claude_payload, ensure_ascii=False)}"
    )

    anthropic_client = get_anthropic_client()
    if anthropic_client is None:
        print('Claude API Pipeline Error: Missing ANTHROPIC_API_KEY in backend process environment.')
        return build_prompt_fallback_response(
            user_prompt,
            essay_answers,
            'Missing ANTHROPIC_API_KEY in backend process environment',
        )

    try:
        message = anthropic_client.messages.create(
            model=get_anthropic_model(),
            max_tokens=700,
            system=CLAUDE_PEDAGOGICAL_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt_content}]
        )
        response_text = extract_message_text(message)
        if not str(response_text).strip():
            raise ValueError('Claude returned an empty response.')

        sections = parse_professor_response_sections(response_text)
        if not sections['breakdown'] or not sections['recommendation'] or not sections['follow_up']:
            return build_prompt_fallback_response(user_prompt, essay_answers, 'Model response missing required sections')

        return format_professor_prompt_response(
            sections['breakdown'],
            sections['recommendation'],
            sections['follow_up'],
        )
    except Exception as e:
        print(f"Claude API Pipeline Error: {str(e)}")
        return build_prompt_fallback_response(user_prompt, essay_answers, str(e))


def generate_claude_chat_response(user_prompt, essay_answers, active_question_text=''):
    direct_prompt = str(user_prompt or '').strip()
    if not direct_prompt:
        return 'Please share a prompt so I can respond using the current student response context.'

    context_items = essay_answers[:80]
    context_block = build_claude_student_context(active_question_text, context_items)

    anthropic_client = get_anthropic_client()
    if anthropic_client is None:
        raise RuntimeError('Claude API key is not configured on the server environment.')

    message = anthropic_client.messages.create(
        model=get_anthropic_model(),
        max_tokens=900,
        system=CLAUDE_CONVERSATIONAL_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Instructor Query:\n{direct_prompt}\n\n"
                    f"ClassPulse Context:\n{context_block}"
                ),
            }
        ]
    )
    response_text = extract_message_text(message)
    if not str(response_text).strip():
        raise ValueError('Claude returned an empty response.')

    return strip_developer_artifacts(response_text)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        username = data['username'].strip()
        email = data['email'].strip().lower()
        role = data['role']
        security_question = str(data.get('security_question') or '').strip()
        security_answer = str(data.get('security_answer') or '').strip()

        if role == 'professor':
            return Response(
                {'error': 'Access Denied: Instructor registration is disabled.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if User.objects.filter(username=username).exists():
            return Response({'error': 'Username already exists.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email=email).exists():
            return Response({'error': 'Email already exists.'}, status=status.HTTP_400_BAD_REQUEST)
        if role == 'student' and not (security_question and security_answer):
            return Response(
                {'error': 'Students must set a security question and answer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.create_user(
            username=username,
            email=email,
            password=data['password'],
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
        )
        user.profile.role = role
        if role == 'student':
            normalized_answer = normalize_security_answer(security_answer)
            user.profile.security_question = security_question
            user.profile.security_answer = make_password(normalized_answer)
            user.profile.save(update_fields=['role', 'security_question', 'security_answer'])
        else:
            user.profile.security_question = ''
            user.profile.security_answer = ''
            user.profile.save(update_fields=['role', 'security_question', 'security_answer'])

        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'message': 'Registration successful.',
            'token': token.key,
            'user': {
                'id': user.id,
                'name': f"{user.first_name} {user.last_name}".strip() or user.username,
                'username': user.username,
                'email': user.email,
                'role': user.profile.role,
                'security_question': user.profile.security_question,
            },
        }, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['username'].strip().lower()
        password = serializer.validated_data['password']

        admin_override_email = 'menon@ucmerced.edu'
        admin_override_password = 'Menon@123'

        incoming_email = email.strip().lower()
        is_admin_override_login = (
            incoming_email == admin_override_email
            and password == admin_override_password
        )

        if is_admin_override_login:
            user = User.objects.filter(email=admin_override_email).order_by('id').first()
            if user is None:
                user = User.objects.create(
                    username=admin_override_email,
                    email=admin_override_email,
                    first_name='Dr. Reshma',
                    last_name='Menon',
                )
                user.set_password(admin_override_password)
                user.save(update_fields=['password'])
            else:
                user_update_fields = []
                if str(user.email or '').strip().lower() != admin_override_email:
                    user.email = admin_override_email
                    user_update_fields.append('email')
                if not str(user.first_name or '').strip():
                    user.first_name = 'Dr. Reshma'
                    user_update_fields.append('first_name')
                if not str(user.last_name or '').strip():
                    user.last_name = 'Menon'
                    user_update_fields.append('last_name')
                if user_update_fields:
                    user.save(update_fields=user_update_fields)

            profile, _ = UserProfile.objects.get_or_create(user=user)
            if profile.role != 'professor':
                profile.role = 'professor'
                profile.save(update_fields=['role'])
        else:
            user = authenticate(username=email, password=password)
            if user is None:
                user_by_email = User.objects.filter(email=email).first()
                if user_by_email:
                    user = authenticate(username=user_by_email.username, password=password)

        if user is None:
            return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        token, created = Token.objects.get_or_create(user=user)
        if not created and token.created < timezone.now() - timedelta(hours=24):
            token.delete()
            token = Token.objects.create(user=user)

        return Response({
            'message': 'Login successful.',
            'token': token.key,
            'user': {
                'id': user.id,
                'name': f"{user.first_name} {user.last_name}".strip() or user.username,
                'username': user.username,
                'email': user.email,
                'role': getattr(user.profile, 'role', 'student'),
            },
        }, status=status.HTTP_200_OK)


class StudentForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = str(request.data.get('username') or '').strip()
        security_question = str(request.data.get('security_question') or '').strip()
        security_answer = str(request.data.get('security_answer') or '').strip()
        new_password = str(request.data.get('new_password') or '').strip()

        if not username or not security_answer or not new_password:
            return Response(
                {'error': 'username, security_answer, and new_password are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(username=username).select_related('profile').first()
        if not user or getattr(user.profile, 'role', '') != 'student':
            return Response({'error': 'Student account not found.'}, status=status.HTTP_404_NOT_FOUND)

        if security_question and user.profile.security_question != security_question:
            return Response({'error': 'Security verification failed.'}, status=status.HTTP_400_BAD_REQUEST)

        normalized_answer = normalize_security_answer(security_answer)
        if not user.profile.security_answer or not check_password(normalized_answer, user.profile.security_answer):
            return Response({'error': 'Security verification failed.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=['password'])

        return Response({'message': 'Password updated successfully.'}, status=status.HTTP_200_OK)


class ProfessorQuizHistoryView(APIView):
    authentication_classes = [BearerOrTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = getattr(getattr(request.user, 'profile', None), 'role', None)
        if role != 'professor':
            return Response({'error': 'Instructor access required.'}, status=status.HTTP_403_FORBIDDEN)

        quizzes = Quiz.objects.filter(created_by=request.user).order_by('-created_at')
        if not quizzes.exists():
            quizzes = Quiz.objects.all().order_by('-created_at')

        history = []
        for quiz in quizzes:
            submission_count = quiz.submissions.count()
            has_ai_summary_cached = bool(
                (quiz.shared_insight_text and str(quiz.shared_insight_text).strip())
                or quiz.custom_prompts.exists()
                or submission_count > 0
            )
            history.append({
                'id': str(quiz.id),
                'title': quiz.title,
                'access_code': quiz.access_code,
                'status': quiz.status,
                'created_by': quiz.created_by.username if quiz.created_by else None,
                'created_at': quiz.created_at.isoformat(),
                'total_submissions': submission_count,
                'has_ai_summary_cached': has_ai_summary_cached,
            })

        return Response({'history': history}, status=status.HTTP_200_OK)


class CustomAnalyticsPromptView(APIView):
    permission_classes = [AllowAny]

    def _resolve_mode(self, request, forced_mode=None):
        if forced_mode in {'chat', 'summary'}:
            return forced_mode

        raw_mode = str(request.data.get('mode') or request.data.get('request_type') or '').strip().lower()
        if raw_mode in {'chat', 'summary'}:
            return raw_mode

        is_summary = parse_boolean_flag(request.data.get('is_summary'), default=False)
        return 'summary' if is_summary else 'chat'

    def _handle_prompt(self, request, forced_mode=None):
        mode = self._resolve_mode(request, forced_mode=forced_mode)

        user_prompt = str(request.data.get('prompt') or request.data.get('prompt_text') or '').strip()
        quiz_id = request.data.get('quiz_id')
        access_code = str(request.data.get('access_code') or request.data.get('pin') or '').strip()
        question_id = str(request.data.get('question_id') or request.data.get('active_question_id') or '').strip()

        if not user_prompt:
            return Response({'error': 'prompt_text is required.'}, status=status.HTTP_400_BAD_REQUEST)

        quiz = None
        if quiz_id:
            quiz = Quiz.objects.filter(pk=quiz_id).first()
        if not quiz and access_code:
            quiz = Quiz.objects.filter(access_code=access_code).first()

        if not quiz:
            return Response({'error': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

        selected_question = None
        if question_id:
            selected_question = quiz.questions.filter(id=question_id).first()
            if not selected_question:
                return Response({'error': 'Question not found for this quiz.'}, status=status.HTTP_404_NOT_FOUND)

        essay_answers = extract_prompt_context_answers_for_pin(
            quiz.access_code,
            question_id=question_id or None,
        )
        selected_question_text = ''
        if selected_question:
            selected_question_text = (
                f"Title: {str(selected_question.question_title or '').strip()}\n"
                f"Prompt: {str(selected_question.question_text or '').strip()}\n"
                f"Type: {str(selected_question.question_type or '').strip()}"
            ).strip()

        if mode == 'summary':
            generated_text = generate_claude_summary_response(
                user_prompt,
                essay_answers,
                active_question_text=selected_question_text,
            )
        else:
            try:
                generated_text = generate_claude_chat_response(
                    user_prompt,
                    essay_answers,
                    active_question_text=selected_question_text,
                )
            except Exception as exc:
                print(f"Claude Chat Pipeline Error: {str(exc)}")
                return Response(
                    {'error': f"Claude chat is unavailable right now: {str(exc)}"},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        prompt_record = CustomAnalyticsPrompt.objects.create(
            quiz=quiz,
            question=selected_question,
            prompt_text=user_prompt,
            response_text=generated_text,
            is_announcement=False,
        )

        return Response({
            'id': prompt_record.id,
            'quiz_id': str(quiz.id),
            'prompt_text': prompt_record.prompt_text,
            'response_text': prompt_record.response_text,
            'response': prompt_record.response_text,
            'reply': prompt_record.response_text,
            'question_id': prompt_record.question_id,
            'is_announcement': prompt_record.is_announcement,
            'mode': mode,
            'created_at': prompt_record.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)

    def post(self, request):
        return self._handle_prompt(request, forced_mode=None)


class AnalyticsSummaryView(CustomAnalyticsPromptView):
    permission_classes = [AllowAny]

    def post(self, request):
        return self._handle_prompt(request, forced_mode='summary')


class AnalyticsChatView(CustomAnalyticsPromptView):
    permission_classes = [AllowAny]

    def post(self, request):
        return self._handle_prompt(request, forced_mode='chat')


class ShareCustomAnalyticsPromptView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        prompt_id = request.data.get('prompt_id')
        quiz_id = request.data.get('quiz_id')
        access_code = str(request.data.get('access_code') or request.data.get('pin') or '').strip()

        if not prompt_id:
            return Response({'error': 'prompt_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            prompt_qs = CustomAnalyticsPrompt.objects.select_related('quiz').filter(id=prompt_id)

            if quiz_id:
                prompt_qs = prompt_qs.filter(quiz_id=quiz_id)
            elif access_code:
                prompt_qs = prompt_qs.filter(quiz__access_code=access_code)

            prompt_record = prompt_qs.get()
        except CustomAnalyticsPrompt.DoesNotExist:
            return Response({'error': 'Prompt record not found.'}, status=status.HTTP_404_NOT_FOUND)

        prompt_record.is_announcement = True
        prompt_record.save(update_fields=['is_announcement'])

        quiz = prompt_record.quiz
        quiz.shared_insight_text = prompt_record.response_text
        quiz.shared_insight_updated_at = timezone.now()
        quiz.save(update_fields=['shared_insight_text', 'shared_insight_updated_at'])

        return Response({
            'prompt_id': prompt_record.id,
            'quiz_id': str(quiz.id),
            'is_announcement': True,
            'shared_insight_text': quiz.shared_insight_text,
            'shared_insight_updated_at': quiz.shared_insight_updated_at.isoformat() if quiz.shared_insight_updated_at else None,
        }, status=status.HTTP_200_OK)


class LiveAnalyticsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        print("DEBUG: Checking raw answers for this quiz session:", list(request.data or request.GET))
        print(f"🔍 ANALYTICS REQUEST RECEIVED FOR PIN: {request.GET.get('pin')} or {request.GET.get('access_code')}")
        pin_param = str(
            request.GET.get('pin', '')
            or request.GET.get('quiz_pin', '')
            or request.GET.get('access_code', '')
        ).strip()
        refresh_requested = str(request.GET.get('refresh', '')).strip().lower() in {'1', 'true', 'yes', 'on'}
        action = parse_analytics_action(request.GET.get('action'))
        question_id = str(request.GET.get('question_id') or '').strip()

        if not pin_param:
            return Response({'error': 'pin is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not question_id:
            return Response({'error': 'question_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        quiz = Quiz.objects.filter(access_code=pin_param).prefetch_related('questions', 'custom_prompts', 'peer_responses__question').first()
        if not quiz:
            return Response({'error': 'Quiz not found for this pin.'}, status=status.HTTP_404_NOT_FOUND)

        selected_question = quiz.questions.filter(id=question_id).first()
        if not selected_question:
            return Response({'error': 'Question not found for this quiz.'}, status=status.HTTP_404_NOT_FOUND)

        question_catalog = [
            {
                'id': question.id,
                'label': f"Question {index + 1}: {str(question.question_title or question.question_text or 'Untitled').strip()[:90]}",
                'question_title': question.question_title,
                'question_text': question.question_text,
                'question_type': question.question_type,
                'interaction_data': question.interaction_data if isinstance(question.interaction_data, dict) else {},
            }
            for index, question in enumerate(quiz.questions.all())
        ]

        submissions = Submission.objects.filter(quiz__access_code=pin_param).order_by('-submitted_at')
        responses = []
        filtered_submissions = []

        for submission in submissions:
            answer_items = submission.answers if isinstance(submission.answers, list) else []
            has_selected_answer = any(
                isinstance(answer, dict) and answer_matches_question_id(answer, question_id)
                for answer in answer_items
            )
            if not has_selected_answer:
                continue

            filtered_submissions.append(submission)
            responses.append({
                'id': submission.id,
                'student_name': submission.student_name,
                'submitted_at': submission.submitted_at.isoformat(),
            })

        total_submissions_count = len(responses)
        active_student_count = len({submission.student_name for submission in filtered_submissions})

        should_generate_cloud = action in {'generate_cloud', 'generate_all'}
        should_generate_summary = action in {'generate_summary', 'generate_all'} or refresh_requested
        include_heavy_analytics = should_generate_cloud or should_generate_summary

        response_type_breakdown = {
            'multiple_choice': 0,
            'essay': 0,
            'matching': 0,
            'other': 0,
        }

        gist_list = []
        misconceptions = ''
        key_themes = ''
        word_counts = {}
        ai_source = 'fallback'
        word_cloud_image_data_uri = ''

        if include_heavy_analytics:
            insight_texts = extract_prompt_context_answers_for_pin(pin_param, question_id=question_id)
            claude_insights = generate_claude_dashboard_insights(insight_texts, force_model=refresh_requested)
            gist_list = claude_insights.get('gist_list', [])
            misconceptions = claude_insights.get('misconceptions', '')
            key_themes = claude_insights.get('key_themes', '')
            word_counts = claude_insights.get('word_counts', {})
            ai_source = claude_insights.get('ai_source', 'fallback')

        try:
            analytics_payload = QuizViewSet()._build_analytics_payload(
                quiz,
                question_id=question_id,
                include_heavy_analytics=include_heavy_analytics,
            )

            for submission in filtered_submissions:
                for answer in submission.answers or []:
                    if not isinstance(answer, dict):
                        continue

                    if not answer_matches_question_id(answer, question_id):
                        continue

                    question_type = normalize_question_type(answer.get('question_type'))
                    if question_type in {'Multiple Choice', 'True/False'}:
                        response_type_breakdown['multiple_choice'] += 1
                    elif question_type in {'Essay', 'Fill In the Blank'}:
                        response_type_breakdown['essay'] += 1
                    elif question_type == 'Matching':
                        response_type_breakdown['matching'] += 1
                    else:
                        response_type_breakdown['other'] += 1

            word_cloud_data = analytics_payload.get('word_cloud_data') or analytics_payload.get('word_cloud') or []
            class_confidence_value = analytics_payload.get('confidence_index', analytics_payload.get('class_confidence_index', 0))
            class_confidence_percent = int(round(class_confidence_value * 100)) if float(class_confidence_value or 0) <= 1 else int(round(class_confidence_value or 0))

            if should_generate_cloud and not word_cloud_data:
                word_cloud_data = format_word_cloud_data(word_counts, limit=30)
            if should_generate_cloud:
                image_source_counts = word_counts
                if not image_source_counts and isinstance(word_cloud_data, list):
                    image_source_counts = {
                        str(item.get('text') or '').strip(): int(item.get('value') or 0)
                        for item in word_cloud_data
                        if isinstance(item, dict) and str(item.get('text') or '').strip()
                    }
                word_cloud_image_data_uri = build_word_cloud_image_data_uri(
                    image_source_counts,
                    question_seed=f"{pin_param}-{question_id}",
                )
            if should_generate_summary and not gist_list:
                gist_list = ['Building a live summary from current student responses.']
            if should_generate_summary and not misconceptions:
                misconceptions = 'Awaiting incoming student inputs to flag conceptual hurdles.'
            if should_generate_summary and not key_themes:
                key_themes = 'Aggregating lesson themes dynamically.'

            response_data = {
                'quiz_id': str(quiz.id),
                'active_question_id': int(question_id),
                'question_id': int(question_id),
                'question_catalog': question_catalog,
                'question_prompt': selected_question.question_text,
                'is_shared_with_students': getattr(quiz, 'is_shared_with_students', False),
                'total_submissions': total_submissions_count,
                'word_cloud_data': word_cloud_data if should_generate_cloud else analytics_payload.get('word_cloud_data', []),
                'word_cloud': word_cloud_data if should_generate_cloud else analytics_payload.get('word_cloud_data', []),
                'word_cloud_image_data_uri': word_cloud_image_data_uri if should_generate_cloud else '',
                'ai_source': ai_source,
                'gist_list': gist_list if should_generate_summary else [],
                'gistList': gist_list if should_generate_summary else [],
                'misconceptions': misconceptions if should_generate_summary else '',
                'key_themes': key_themes if should_generate_summary else '',
                'class_confidence_index': class_confidence_percent,
                'classConfidenceIndex': class_confidence_percent,
                'confidence_index': class_confidence_percent,
                'analytics_action': action,
                'generated_word_cloud': bool(should_generate_cloud),
                'generated_summary': bool(should_generate_summary),
            }

            analytics_payload.update(response_data)

            if should_generate_summary and isinstance(misconceptions, str):
                analytics_payload['common_misconceptions'] = [misconceptions]
            elif should_generate_summary:
                analytics_payload['common_misconceptions'] = misconceptions
            else:
                analytics_payload['common_misconceptions'] = []

            if should_generate_summary and isinstance(key_themes, str):
                analytics_payload['key_themes_detected'] = [key_themes]
            elif should_generate_summary:
                analytics_payload['key_themes_detected'] = key_themes
            else:
                analytics_payload['key_themes_detected'] = []

            analytics_payload['most_popular_gists'] = gist_list if should_generate_summary else []
        except Exception as err:
            print(f"CRITICAL ANALYTICS FAILURE: {str(err)}")
            analytics_payload = {
                'quiz_id': str(quiz.id),
                'active_question_id': int(question_id),
                'question_id': int(question_id),
                'question_catalog': question_catalog,
                'question_prompt': selected_question.question_text,
                'is_shared_with_students': getattr(quiz, 'is_shared_with_students', False),
                'total_submissions': total_submissions_count,
                'word_cloud_data': format_word_cloud_data(word_counts, limit=30) if should_generate_cloud else [],
                'word_cloud': format_word_cloud_data(word_counts, limit=30) if should_generate_cloud else [],
                'word_cloud_image_data_uri': build_word_cloud_image_data_uri(
                    word_counts,
                    question_seed=f"{pin_param}-{question_id}",
                ) if should_generate_cloud else '',
                'ai_source': ai_source,
                'gist_list': (gist_list or ['Building a live summary from current student responses.']) if should_generate_summary else [],
                'gistList': (gist_list or ['Building a live summary from current student responses.']) if should_generate_summary else [],
                'misconceptions': (misconceptions or 'Awaiting incoming student inputs to flag conceptual hurdles.') if should_generate_summary else '',
                'key_themes': (key_themes or 'Aggregating lesson themes dynamically.') if should_generate_summary else '',
                'common_misconceptions': [misconceptions or 'Awaiting incoming student inputs to flag conceptual hurdles.'] if should_generate_summary else [],
                'key_themes_detected': [key_themes or 'Aggregating lesson themes dynamically.'] if should_generate_summary else [],
                'most_popular_gists': (gist_list or ['Building a live summary from current student responses.']) if should_generate_summary else [],
                'average_score': 0,
                'max_score': 0,
                'min_score': 0,
                'analytics_action': action,
                'generated_word_cloud': bool(should_generate_cloud),
                'generated_summary': bool(should_generate_summary),
            }

        analytics_payload.update({
            'success': True,
            'quiz_pin': pin_param,
            'active_question_id': int(question_id),
            'question_id': int(question_id),
            'question_catalog': question_catalog,
            'total_submissions': total_submissions_count,
            'submissions_count': total_submissions_count,
            'active_student_count': active_student_count,
            'response_type_breakdown': response_type_breakdown,
            'responses': responses,
            'analytics_action': action,
            'generated_word_cloud': bool(should_generate_cloud),
            'generated_summary': bool(should_generate_summary),
        })

        return Response(analytics_payload, status=status.HTTP_200_OK)


class QuestionImageUploadView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        return upload_image_asset(request, directory_name='question_images', response_key='question_image_url')


class ChoiceImageUploadView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        return upload_image_asset(request, directory_name='choice_images', response_key='image_url')


def upload_image_asset(request, directory_name='question_images', response_key='image_url'):
    image_file = request.FILES.get('image')
    if not image_file:
        return Response({'error': 'image file is required.'}, status=status.HTTP_400_BAD_REQUEST)

    content_type = str(image_file.content_type or '').lower()
    if not content_type.startswith('image/'):
        return Response({'error': 'Only image uploads are supported.'}, status=status.HTTP_400_BAD_REQUEST)

    max_bytes = 10 * 1024 * 1024
    file_size = int(getattr(image_file, 'size', 0) or 0)
    if file_size > max_bytes:
        return Response({'error': 'Image must be 10MB or smaller.'}, status=status.HTTP_400_BAD_REQUEST)

    extension = os.path.splitext(image_file.name)[1] or '.png'
    storage_path = f"{directory_name}/{uuid.uuid4().hex}{extension}"
    stored_path = default_storage.save(storage_path, image_file)
    image_url = default_storage.url(stored_path)
    absolute_image_url = request.build_absolute_uri(image_url)

    return Response({
        response_key: absolute_image_url,
        'image_url': absolute_image_url,
    }, status=status.HTTP_201_CREATED)


class QuestionPeerResponsesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, quiz_id, question_id):
        student_name = str(request.query_params.get('student_name', '')).strip()

        try:
            question = Quiz.objects.get(pk=quiz_id).questions.get(pk=question_id)
        except Quiz.DoesNotExist:
            return Response({'error': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Question.DoesNotExist:
            return Response({'error': 'Question not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not question.allow_peer_upvoting:
            return Response({'responses': []}, status=status.HTTP_200_OK)

        responses = question.peer_responses.all()
        serializer = PeerResponseSerializer(responses, many=True, context={'student_name': student_name})
        return Response({'responses': serializer.data}, status=status.HTTP_200_OK)

    def post(self, request, quiz_id, question_id):
        student_name = str(request.data.get('student_name', '')).strip()
        response_text = str(request.data.get('response_text', '')).strip()

        if not student_name:
            return Response({'error': 'student_name is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not response_text:
            return Response({'error': 'response_text is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            quiz = Quiz.objects.get(pk=quiz_id)
            question = quiz.questions.get(pk=question_id)
        except Quiz.DoesNotExist:
            return Response({'error': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Question.DoesNotExist:
            return Response({'error': 'Question not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not question.allow_peer_upvoting:
            return Response({'error': 'Peer upvoting is not enabled for this question.'}, status=status.HTTP_400_BAD_REQUEST)

        peer_response, created = PeerResponse.objects.get_or_create(
            quiz=quiz,
            question=question,
            student_name=student_name,
            defaults={'response_text': response_text},
        )

        if not created and peer_response.response_text != response_text:
            peer_response.response_text = response_text
            peer_response.upvote_count = 0
            peer_response.upvoted_by = []
            peer_response.save(update_fields=['response_text', 'upvote_count', 'upvoted_by'])

        serializer = PeerResponseSerializer(peer_response, context={'student_name': student_name})
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class PeerResponseUpvoteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, response_id):
        student_name = str(request.data.get('student_name', '')).strip()
        if not student_name:
            return Response({'error': 'student_name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                peer_response = PeerResponse.objects.select_for_update().get(pk=response_id)
                voters = list(peer_response.upvoted_by or [])

                if peer_response.student_name == student_name:
                    return Response({'error': 'You cannot upvote your own response.'}, status=status.HTTP_400_BAD_REQUEST)

                if student_name in voters:
                    voters.remove(student_name)
                    peer_response.upvoted_by = voters
                    peer_response.upvote_count = max(0, int(peer_response.upvote_count or 0) - 1)
                    peer_response.save(update_fields=['upvote_count', 'upvoted_by'])
                    peer_response.refresh_from_db()
                    serializer = PeerResponseSerializer(peer_response, context={'student_name': student_name})
                    return Response({'already_upvoted': False, 'toggled': 'removed', 'response': serializer.data}, status=status.HTTP_200_OK)

                voters.append(student_name)
                peer_response.upvoted_by = voters
                peer_response.upvote_count = F('upvote_count') + 1
                peer_response.save(update_fields=['upvote_count', 'upvoted_by'])
                peer_response.refresh_from_db()
        except PeerResponse.DoesNotExist:
            return Response({'error': 'Response not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = PeerResponseSerializer(peer_response, context={'student_name': student_name})
        return Response({'already_upvoted': True, 'toggled': 'added', 'response': serializer.data}, status=status.HTTP_200_OK)


class QuizViewSet(viewsets.ModelViewSet):
    queryset = Quiz.objects.prefetch_related('questions').all()
    serializer_class = QuizSerializer

    def get_queryset(self):
        base_qs = Quiz.objects.prefetch_related('questions').all().order_by('-created_at')

        if getattr(self, 'action', None) != 'list':
            return base_qs

        user = getattr(self.request, 'user', None)
        if not user or not user.is_authenticated:
            return Quiz.objects.none()

        role = getattr(getattr(user, 'profile', None), 'role', None)
        if role == 'professor':
            return base_qs.filter(created_by=user)

        return Quiz.objects.none()

    def get_serializer_class(self):
        return QuizSerializer

    def create(self, request, *args, **kwargs):
        payload = request.data.copy()
        incoming_status = str(payload.get('status') or '').strip().upper()
        if incoming_status in {'PUBLISHED', 'DRAFT'}:
            payload['status'] = 'READY'

        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        save_kwargs = {
            'duration_minutes': int(payload.get('duration_minutes') or payload.get('time_limit_minutes') or 10),
            'status': payload.get('status') or 'READY',
        }

        if request.user and request.user.is_authenticated:
            save_kwargs['created_by'] = request.user

        quiz = serializer.save(**save_kwargs)

        # Rehydrate from DB to guarantee the response includes persisted nested questions and metadata.
        hydrated_quiz = Quiz.objects.prefetch_related('questions').get(pk=quiz.pk)
        response_serializer = self.get_serializer(hydrated_quiz)
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=False, methods=['post'], url_path='unlock')
    def unlock_quiz(self, request):
        code = request.data.get('access_code')
        if not code:
            return Response({'error': 'Access code required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            quiz = Quiz.objects.get(access_code=str(code).strip())
        except Quiz.DoesNotExist:
            return Response({'error': 'Invalid access code.'}, status=status.HTTP_404_NOT_FOUND)

        can_enter, gate_message = enforce_quiz_runtime_gate(quiz)
        if not can_enter:
            return Response({'error': gate_message}, status=status.HTTP_403_FORBIDDEN)

        serializer = self.get_serializer(quiz)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='start')
    def start_quiz(self, request):
        quiz_id = request.data.get('quiz_id')
        access_code = str(request.data.get('access_code') or request.data.get('pin') or '').strip()

        quiz = None
        if quiz_id:
            quiz = Quiz.objects.filter(pk=quiz_id).first()
        if not quiz and access_code:
            quiz = Quiz.objects.filter(access_code=access_code).first()

        if not quiz:
            return Response({'error': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

        quiz.status = 'ACTIVE'
        quiz.started_at = timezone.now()
        if quiz.duration_minutes <= 0:
            quiz.duration_minutes = 10
        quiz.save(update_fields=['status', 'started_at', 'duration_minutes'])

        return Response({
            'quiz_id': str(quiz.id),
            'status': quiz.status,
            'started_at': quiz.started_at.isoformat() if quiz.started_at else None,
            'duration_minutes': quiz.duration_minutes,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='stop')
    def stop_quiz(self, request):
        quiz_id = request.data.get('quiz_id')
        access_code = str(request.data.get('access_code') or request.data.get('pin') or '').strip()

        quiz = None
        if quiz_id:
            quiz = Quiz.objects.filter(pk=quiz_id).first()
        if not quiz and access_code:
            quiz = Quiz.objects.filter(access_code=access_code).first()

        if not quiz:
            return Response({'error': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)

        quiz.status = 'COMPLETED'
        quiz.save(update_fields=['status'])

        return Response({
            'quiz_id': str(quiz.id),
            'status': quiz.status,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='analytics')
    def analytics(self, request, pk=None):
        quiz = self.get_object()
        question_id = str(request.query_params.get('question_id') or '').strip()
        action = parse_analytics_action(request.query_params.get('action'))
        if not question_id:
            return Response({'error': 'question_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if not quiz.questions.filter(id=question_id).exists():
            return Response({'error': 'Question not found for this quiz.'}, status=status.HTTP_404_NOT_FOUND)

        should_generate_cloud = action in {'generate_cloud', 'generate_all'}
        should_generate_summary = action in {'generate_summary', 'generate_all'}
        include_heavy_analytics = should_generate_cloud or should_generate_summary

        data = self._build_analytics_payload(
            quiz,
            question_id=question_id,
            include_heavy_analytics=include_heavy_analytics,
        )

        word_cloud_counts = {}
        word_cloud_data = []

        if include_heavy_analytics:
            insight_texts = extract_prompt_context_answers_for_pin(quiz.access_code, question_id=question_id)
            insights = generate_claude_dashboard_insights(insight_texts, force_model=False)
            data['ai_source'] = insights.get('ai_source', data.get('ai_source', 'fallback'))
            word_cloud_counts = insights.get('word_counts', {}) if isinstance(insights, dict) else {}
            word_cloud_data = insights.get('word_cloud_data', []) if isinstance(insights, dict) else []

            if should_generate_summary:
                data['gist_list'] = insights.get('gist_list', data.get('gist_list', []))
                data['gistList'] = data['gist_list']
                data['misconceptions'] = insights.get('misconceptions', 'Awaiting incoming student inputs to flag conceptual hurdles.')
                data['common_misconceptions'] = [data['misconceptions']] if isinstance(data['misconceptions'], str) else data['misconceptions']
                data['key_themes'] = insights.get('key_themes', 'Aggregating lesson themes dynamically.')
                data['key_themes_detected'] = [data['key_themes']] if isinstance(data['key_themes'], str) else data['key_themes']
            else:
                data['gist_list'] = []
                data['gistList'] = []
                data['misconceptions'] = ''
                data['common_misconceptions'] = []
                data['key_themes'] = ''
                data['key_themes_detected'] = []

            if should_generate_cloud and not data.get('word_cloud_data'):
                data['word_cloud_data'] = word_cloud_data or format_word_cloud_data(word_cloud_counts, limit=30)
                data['word_cloud'] = data['word_cloud_data']
        else:
            data['gist_list'] = []
            data['gistList'] = []
            data['misconceptions'] = ''
            data['common_misconceptions'] = []
            data['key_themes'] = ''
            data['key_themes_detected'] = []

        data['analytics_action'] = action
        data['generated_word_cloud'] = bool(should_generate_cloud)
        data['generated_summary'] = bool(should_generate_summary)

        if should_generate_cloud:
            if not word_cloud_counts and isinstance(data.get('word_cloud_data'), list):
                word_cloud_counts = {
                    str(item.get('text') or '').strip(): int(item.get('value') or 0)
                    for item in data.get('word_cloud_data', [])
                    if isinstance(item, dict) and str(item.get('text') or '').strip()
                }
            if not data.get('word_cloud_data'):
                data['word_cloud_data'] = format_word_cloud_data(word_cloud_counts, limit=30)
            data['word_cloud'] = data.get('word_cloud_data', [])
            data['word_cloud_image_data_uri'] = build_word_cloud_image_data_uri(
                word_cloud_counts,
                question_seed=f"{quiz.access_code}-{question_id}",
            )
        else:
            data['word_cloud_data'] = []
            data['word_cloud'] = []
            data['word_cloud_image_data_uri'] = ''

        return Response(data)

    @action(detail=True, methods=['post'], url_path='analytics/refresh')
    def refresh_analytics(self, request, pk=None):
        quiz = self.get_object()
        question_id = str(request.query_params.get('question_id') or '').strip()
        action = parse_analytics_action(request.query_params.get('action') or 'generate_summary')
        if not question_id:
            return Response({'error': 'question_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        selected_question = quiz.questions.filter(id=question_id).first()
        if not selected_question:
            return Response({'error': 'Question not found for this quiz.'}, status=status.HTTP_404_NOT_FOUND)

        should_generate_cloud = action in {'generate_cloud', 'generate_all'}
        should_generate_summary = action in {'generate_summary', 'generate_all'}
        include_heavy_analytics = should_generate_cloud or should_generate_summary

        data = self._build_analytics_payload(
            quiz,
            question_id=question_id,
            include_heavy_analytics=include_heavy_analytics,
        )

        word_cloud_counts = {}
        word_cloud_data = []

        if include_heavy_analytics:
            insight_texts = extract_prompt_context_answers_for_pin(quiz.access_code, question_id=question_id)
            insights = generate_claude_dashboard_insights(insight_texts, force_model=True)
            data['ai_source'] = insights.get('ai_source', 'fallback')
            word_cloud_counts = insights.get('word_counts', {}) if isinstance(insights, dict) else {}
            word_cloud_data = insights.get('word_cloud_data', []) if isinstance(insights, dict) else []

            if should_generate_summary:
                data['gist_list'] = insights.get('gist_list', [])
                data['gistList'] = data['gist_list']
                data['misconceptions'] = insights.get('misconceptions', 'Awaiting incoming student inputs to flag conceptual hurdles.')
                data['common_misconceptions'] = [data['misconceptions']] if isinstance(data['misconceptions'], str) else data['misconceptions']
                data['key_themes'] = insights.get('key_themes', 'Aggregating lesson themes dynamically.')
                data['key_themes_detected'] = [data['key_themes']] if isinstance(data['key_themes'], str) else data['key_themes']
            else:
                data['gist_list'] = []
                data['gistList'] = []
                data['misconceptions'] = ''
                data['common_misconceptions'] = []
                data['key_themes'] = ''
                data['key_themes_detected'] = []

            if should_generate_cloud and not data.get('word_cloud_data'):
                data['word_cloud_data'] = word_cloud_data or format_word_cloud_data(word_cloud_counts, limit=30)
                data['word_cloud'] = data['word_cloud_data']
            elif not should_generate_cloud:
                data['word_cloud_data'] = []
                data['word_cloud'] = []
        else:
            data['ai_source'] = 'fallback'
            data['gist_list'] = []
            data['gistList'] = []
            data['misconceptions'] = ''
            data['common_misconceptions'] = []
            data['key_themes'] = ''
            data['key_themes_detected'] = []
            data['word_cloud_data'] = []
            data['word_cloud'] = []

        base_confidence = data.get('class_confidence_index', 0)
        confidence_percent = int(round(base_confidence * 100)) if float(base_confidence) <= 1 else int(round(base_confidence))
        data['class_confidence_index'] = confidence_percent
        data['classConfidenceIndex'] = confidence_percent
        data['confidence_index'] = confidence_percent
        data['analytics_action'] = action
        data['generated_word_cloud'] = bool(should_generate_cloud)
        data['generated_summary'] = bool(should_generate_summary)

        if should_generate_cloud:
            if not word_cloud_counts and isinstance(data.get('word_cloud_data'), list):
                word_cloud_counts = {
                    str(item.get('text') or '').strip(): int(item.get('value') or 0)
                    for item in data.get('word_cloud_data', [])
                    if isinstance(item, dict) and str(item.get('text') or '').strip()
                }
            if not data.get('word_cloud_data'):
                data['word_cloud_data'] = format_word_cloud_data(word_cloud_counts, limit=30)
            data['word_cloud'] = data.get('word_cloud_data', [])
            data['word_cloud_image_data_uri'] = build_word_cloud_image_data_uri(
                word_cloud_counts,
                question_seed=f"{quiz.access_code}-{question_id}",
            )
        else:
            data['word_cloud_data'] = []
            data['word_cloud'] = []
            data['word_cloud_image_data_uri'] = ''

        return Response(data)

    @action(detail=True, methods=['post'], url_path='share-analytics')
    def share_analytics(self, request, pk=None):
        quiz = self.get_object()
        raw_share = request.data.get('is_shared_with_students', False)
        if isinstance(raw_share, str):
            should_share = raw_share.strip().lower() in {'1', 'true', 'yes', 'on'}
        else:
            should_share = bool(raw_share)
        quiz.is_shared_with_students = should_share
        quiz.save(update_fields=['is_shared_with_students'])
        return Response({'quiz_id': str(quiz.id), 'is_shared_with_students': quiz.is_shared_with_students})

    def _build_analytics_payload(self, quiz, question_id=None, include_heavy_analytics=True):
        submissions = quiz.submissions.all()
        question_lookup = {question.id: question for question in quiz.questions.all()}
        selected_question = question_lookup.get(int(question_id)) if question_id and str(question_id).isdigit() else None

        filtered_submissions = []
        for submission in submissions:
            if not question_id:
                filtered_submissions.append(submission)
                continue

            answer_items = submission.answers if isinstance(submission.answers, list) else []
            if any(isinstance(answer, dict) and answer_matches_question_id(answer, question_id) for answer in answer_items):
                filtered_submissions.append(submission)

        submissions = filtered_submissions

        total_submissions = len(submissions)
        if submissions:
            score_values = [submission.score for submission in submissions]
            avg_score = sum(score_values) / len(score_values)
            max_score = max(score_values)
            min_score = min(score_values)
        else:
            avg_score = 0
            max_score = 0
            min_score = 0

        essay_text_pool = []
        word_counts = {}
        top_words = []

        if include_heavy_analytics:
            for submission in submissions:
                answer_items = submission.answers if isinstance(submission.answers, list) else []
                for answer in answer_items:
                    if not isinstance(answer, dict):
                        continue

                    if question_id and not answer_matches_question_id(answer, question_id):
                        continue

                    question = question_lookup.get(answer.get('question_id'))
                    question_type = normalize_question_type(
                        answer.get('question_type') or (question.question_type if question else None)
                    )
                    if question_type not in TEXT_ANALYTICS_TYPES:
                        continue

                    essay_text_pool.extend([fragment for fragment in collect_text_fragments(answer.get('answer')) if fragment])

            for essay_text in essay_text_pool:
                tokens = re.findall(r"[a-zA-Z]+", essay_text.lower())
                for token in tokens:
                    if token in STOP_WORDS or len(token) <= 2:
                        continue
                    word_counts[token] = word_counts.get(token, 0) + 1

            top_words = sorted(word_counts.items(), key=lambda item: item[1], reverse=True)[:20]

        if include_heavy_analytics and essay_text_pool:
            essay_word_counts = {}
            for essay_text in essay_text_pool:
                for token in re.findall(r"[a-zA-Z]+", essay_text.lower()):
                    if token in STOP_WORDS or len(token) <= 2:
                        continue
                    essay_word_counts[token] = essay_word_counts.get(token, 0) + 1

            top_essay_words = sorted(essay_word_counts.items(), key=lambda item: item[1], reverse=True)[:3]
            common_misconceptions = [f"Students repeatedly mentioned {word}" for word, _ in top_essay_words] or ['No recurring misconception pattern detected yet.']
            key_themes_detected = [f"Conceptual focus on {word}" for word, _ in top_essay_words] or ['Essay responses are still emerging.']
            class_confidence_index = round(min(0.95, max(0.2, 0.45 + (len(essay_text_pool) * 0.07) + (len(top_essay_words) * 0.04))), 2)
            most_popular_gists = [
                f"Most students framed their explanation around {word}." for word, _ in top_essay_words
            ]
            most_popular_gists.append(f"Collected {len(essay_text_pool)} essay responses in the current live session.")
            most_popular_gists.append(
                f"The strongest repeated signal is {top_essay_words[0][0]} ({top_essay_words[0][1]} mentions)."
            )
            most_popular_gists = most_popular_gists[:5]
        elif include_heavy_analytics:
            common_misconceptions = ['No essay responses yet.']
            key_themes_detected = ['Waiting for student essay submissions.']
            class_confidence_index = 0.0
            most_popular_gists = [
                'Essay responses are still coming in.',
                'No dominant explanation pattern detected yet.',
                'Share analytics to let students see emerging themes.',
                'Use refresh after submissions arrive to update synthesis.',
            ]
        else:
            common_misconceptions = []
            key_themes_detected = []
            score_span = max_score if max_score else 0
            class_confidence_index = round((avg_score / score_span), 2) if score_span > 0 else 0.0
            most_popular_gists = []

        individual_submissions = []
        for submission in submissions:
            choice_badge = 'N/A'
            text_fragments = []
            detailed_answers = []

            for answer_item in submission.answers or []:
                if not isinstance(answer_item, dict):
                    continue

                if question_id and not answer_matches_question_id(answer_item, question_id):
                    continue

                question = question_lookup.get(answer_item.get('question_id'))
                answer_value = answer_item.get('answer')
                question_type = normalize_question_type(
                    answer_item.get('question_type') or (question.question_type if question else None)
                )
                question_choices = []
                matching_left_items = []
                matching_right_options = []
                if question and isinstance(question.interaction_data, dict):
                    question_choices = normalize_choice_list(
                        question.interaction_data.get('options'),
                        default_true_false=question_type == 'True/False',
                    )
                    matching_left_items = normalize_matching_items(question.interaction_data.get('left_items'), prefix='L')
                    matching_right_options = normalize_matching_items(question.interaction_data.get('right_options'), prefix='R')
                question_option_texts = build_choice_texts(question_choices)

                answer_id = None
                answer_text = ''

                if question_type in {'Multiple Choice', 'True/False'}:
                    if isinstance(answer_value, list):
                        selected_indices = normalize_selected_choice_indices(answer_value, question_choices)
                        answer_id = [
                            str((question_choices[idx] or {}).get('id') or '').strip()
                            for idx in selected_indices
                            if 0 <= idx < len(question_choices)
                        ]
                        labels = [
                            question_option_texts[idx]
                            for idx in selected_indices
                            if 0 <= idx < len(question_option_texts)
                        ]
                        answer_text = ', '.join([label for label in labels if str(label).strip()])
                    else:
                        selected_index = find_choice_index(answer_value, question_choices)
                        if isinstance(selected_index, int) and 0 <= selected_index < len(question_choices):
                            answer_id = str((question_choices[selected_index] or {}).get('id') or '').strip() or str(selected_index)
                            answer_text = str(question_option_texts[selected_index] or '').strip()
                        else:
                            fallback_text = str(answer_value or '').strip()
                            answer_id = fallback_text if fallback_text else None
                            answer_text = fallback_text
                elif question_type == 'Matching':
                    normalized_answer = normalize_matching_answer(answer_value, matching_left_items, matching_right_options)
                    answer_id = normalized_answer
                    right_by_id = {
                        str((item or {}).get('id') or '').strip(): item
                        for item in matching_right_options
                    }
                    segments = []
                    for left_item in matching_left_items:
                        left_id = str((left_item or {}).get('id') or '').strip()
                        if not left_id:
                            continue

                        selected_right_id = str(normalized_answer.get(left_id) or '').strip()
                        if not selected_right_id:
                            segments.append(f"{left_id} -> (unanswered)")
                            continue

                        selected_right = right_by_id.get(selected_right_id, {})
                        selected_right_text = str(selected_right.get('text') or '').strip() or selected_right_id
                        segments.append(f"{left_id} -> {selected_right_id} ({selected_right_text})")

                    answer_text = ' | '.join(segments)
                elif isinstance(answer_value, dict):
                    answer_id = None
                    answer_text = ' | '.join([
                        str(value).strip()
                        for value in answer_value.values()
                        if str(value).strip()
                    ])
                elif isinstance(answer_value, list):
                    answer_id = None
                    answer_text = ', '.join([
                        str(value).strip()
                        for value in answer_value
                        if str(value).strip()
                    ])
                else:
                    answer_id = None
                    answer_text = str(answer_value or '').strip()

                detailed_answers.append({
                    'question_id': answer_item.get('question_id'),
                    'question_title': question.question_title if question else 'Unknown Question',
                    'question_type': question_type,
                    'answer_id': answer_id,
                    'answer_text': answer_text,
                })

                if choice_badge == 'N/A' and question_type in {'Multiple Choice', 'True/False'}:
                    if isinstance(answer_value, list):
                        selected_indices = normalize_selected_choice_indices(answer_value, question_choices)
                        labels = [
                            choice_badge_for_index(question_choices, selected_index)
                            for selected_index in selected_indices
                        ]
                        labels = [label for label in labels if str(label or '').strip()]
                        if labels:
                            choice_badge = ','.join(labels)
                    else:
                        selected_index = find_choice_index(answer_value, question_choices)
                        label = choice_badge_for_index(question_choices, selected_index) if isinstance(selected_index, int) else None
                        if label:
                            choice_badge = label

                if question_type in {'Essay', 'Fill In the Blank'}:
                    if isinstance(answer_value, str) and answer_value.strip():
                        text_fragments.append(answer_value.strip())
                    elif isinstance(answer_value, dict):
                        non_empty_values = [str(value).strip() for value in answer_value.values() if str(value).strip()]
                        if non_empty_values:
                            text_fragments.append(' | '.join(non_empty_values))

            individual_submissions.append({
                'submission_id': submission.id,
                'student_name': submission.student_name,
                'submitted_at': submission.submitted_at.isoformat(),
                'choice_badge': choice_badge,
                'answers': detailed_answers,
                'response_text': '\n\n'.join(text_fragments) if text_fragments else 'No long-form textual response captured for this submission.',
            })

        matching_summary = None
        if selected_question and normalize_question_type(selected_question.question_type) == 'Matching':
            interaction = selected_question.interaction_data if isinstance(selected_question.interaction_data, dict) else {}
            left_items = normalize_matching_items(interaction.get('left_items'), prefix='L')
            right_options = normalize_matching_items(interaction.get('right_options'), prefix='R')
            correct_mapping = normalize_correct_mapping(
                interaction.get('correct_mapping'),
                left_items,
                right_options,
            )
            right_by_id = {
                str((option or {}).get('id') or '').strip(): option
                for option in right_options
            }

            rows = []
            for left_item in left_items:
                left_id = str((left_item or {}).get('id') or '').strip()
                if not left_id:
                    continue

                option_counts = {
                    str((option or {}).get('id') or '').strip(): 0
                    for option in right_options
                    if str((option or {}).get('id') or '').strip()
                }
                answered_count = 0
                correct_count = 0
                correct_right_id = str(correct_mapping.get(left_id) or '').strip()

                for submission in submissions:
                    answer_items = submission.answers if isinstance(submission.answers, list) else []
                    answer_item = next(
                        (
                            item for item in answer_items
                            if isinstance(item, dict) and answer_matches_question_id(item, selected_question.id)
                        ),
                        None,
                    )
                    if not answer_item:
                        continue

                    submission_mapping = normalize_matching_answer(
                        answer_item.get('answer'),
                        left_items,
                        right_options,
                    )
                    selected_right_id = str(submission_mapping.get(left_id) or '').strip()
                    if not selected_right_id:
                        continue

                    answered_count += 1
                    if selected_right_id in option_counts:
                        option_counts[selected_right_id] += 1
                    if correct_right_id and selected_right_id == correct_right_id:
                        correct_count += 1

                selection_breakdown = []
                for right_option in right_options:
                    right_id = str((right_option or {}).get('id') or '').strip()
                    if not right_id:
                        continue

                    count = int(option_counts.get(right_id, 0))
                    percentage = (count / total_submissions * 100) if total_submissions > 0 else 0.0
                    selection_breakdown.append({
                        'right_id': right_id,
                        'text': str((right_option or {}).get('text') or '').strip(),
                        'image_url': (right_option or {}).get('image_url'),
                        'count': count,
                        'percentage': percentage,
                        'is_correct': right_id == correct_right_id,
                    })

                selection_breakdown.sort(key=lambda item: item['count'], reverse=True)

                correct_percentage = (correct_count / total_submissions * 100) if total_submissions > 0 else 0.0
                rows.append({
                    'left_id': left_id,
                    'left_text': str((left_item or {}).get('text') or '').strip(),
                    'left_image_url': (left_item or {}).get('image_url'),
                    'correct_right_id': correct_right_id,
                    'correct_right_text': str((right_by_id.get(correct_right_id, {}) or {}).get('text') or '').strip(),
                    'answered_count': answered_count,
                    'correct_count': correct_count,
                    'correct_percentage': correct_percentage,
                    'selection_breakdown': selection_breakdown,
                })

            matching_summary = {
                'left_items': left_items,
                'right_options': right_options,
                'correct_mapping': correct_mapping,
                'rows': rows,
                'total_submissions': total_submissions,
            }

        prompt_history_queryset = quiz.custom_prompts.all()
        if question_id:
            prompt_history_queryset = prompt_history_queryset.filter(question_id=question_id)

        prompt_history = [
            {
                'id': item.id,
                'prompt_text': item.prompt_text,
                'response_text': item.response_text,
                'is_announcement': item.is_announcement,
                'question_id': item.question_id,
                'created_at': item.created_at.isoformat(),
            }
            for item in prompt_history_queryset[:25]
        ]

        top_voted_answers = [
            {
                'id': item.id,
                'student_name': item.student_name,
                'response_text': item.response_text,
                'upvote_count': item.upvote_count,
                'question_id': item.question_id,
                'question_title': item.question.question_title,
            }
            for item in quiz.peer_responses.select_related('question').filter(
                **({'question_id': question_id} if question_id else {})
            )[:10]
        ]

        peer_upvoting_enabled = quiz.questions.filter(
            allow_peer_upvoting=True,
            **({'id': question_id} if question_id else {})
        ).exists()

        question_catalog = [
            {
                'id': question.id,
                'label': f"Question {index + 1}: {str(question.question_title or question.question_text or 'Untitled').strip()[:90]}",
                'question_title': question.question_title,
                'question_text': question.question_text,
                'question_type': question.question_type,
                'interaction_data': question.interaction_data if isinstance(question.interaction_data, dict) else {},
            }
            for index, question in enumerate(quiz.questions.all())
        ]

        analytics = {
            'quiz_id': str(quiz.id),
            'active_question_id': int(question_id) if question_id else None,
            'question_id': int(question_id) if question_id else None,
            'active_question_type': normalize_question_type(selected_question.question_type) if selected_question else None,
            'question_prompt': selected_question.question_text if selected_question else '',
            'question_catalog': question_catalog,
            'status': quiz.status,
            'quiz_status': quiz.status,
            'duration_minutes': quiz.duration_minutes,
            'started_at': quiz.started_at.isoformat() if quiz.started_at else None,
            'is_shared_with_students': quiz.is_shared_with_students,
            'shared_insight_text': quiz.shared_insight_text,
            'shared_insight_updated_at': quiz.shared_insight_updated_at.isoformat() if quiz.shared_insight_updated_at else None,
            'peer_upvoting_enabled': peer_upvoting_enabled,
            'total_submissions': total_submissions,
            'average_score': avg_score,
            'max_score': max_score,
            'min_score': min_score,
            'word_cloud_data': [{'text': word, 'value': count} for word, count in top_words] if include_heavy_analytics else [],
            'word_cloud': [{'text': word, 'value': count} for word, count in top_words] if include_heavy_analytics else [],
            'essay_summary': {
                'common_misconceptions': common_misconceptions,
                'key_themes_detected': key_themes_detected,
                'class_confidence_index': class_confidence_index,
                'most_popular_gists': most_popular_gists,
            },
            'common_misconceptions': common_misconceptions,
            'misconceptions': common_misconceptions,
            'key_themes_detected': key_themes_detected,
            'key_themes': key_themes_detected,
            'class_confidence_index': class_confidence_index,
            'most_popular_gists': most_popular_gists,
            'gist_list': most_popular_gists,
            'individual_submissions': individual_submissions,
            'matching_summary': matching_summary,
            'custom_prompt_history': prompt_history,
            'top_voted_answers': top_voted_answers,
        }
        return analytics


class SubmissionViewSet(viewsets.ModelViewSet):
    queryset = Submission.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return SubmissionCreateSerializer
        return SubmissionSerializer

    def create(self, request, *args, **kwargs):
        payload = request.data.copy()
        pin = extract_access_pin(payload)
        quiz_id = payload.get('quiz')
        normalized_student_name = str(payload.get('student_name') or '').strip()
        quiz = None

        if quiz_id:
            quiz = Quiz.objects.filter(pk=quiz_id).first()

        if not quiz and pin:
            quiz = Quiz.objects.filter(access_code=pin).first()
            if not quiz:
                return Response({'error': 'Invalid access code.'}, status=status.HTTP_404_NOT_FOUND)
            payload['quiz'] = str(quiz.id)

        if quiz:
            can_submit, gate_message = enforce_quiz_runtime_gate(quiz)
            if not can_submit:
                return Response({'error': gate_message}, status=status.HTTP_403_FORBIDDEN)

        if normalized_student_name:
            payload['student_name'] = normalized_student_name

        if quiz and normalized_student_name:
            already_submitted = Submission.objects.filter(
                quiz=quiz,
                student_name__iexact=normalized_student_name,
            ).exists()
            if already_submitted:
                return Response(
                    {'error': 'Retakes are disabled. You have already submitted this quiz.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        submission = serializer.save()
        self.grade_submission(submission)
        self.sync_peer_responses(submission)
        response_serializer = SubmissionSerializer(submission)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def sync_peer_responses(self, submission):
        question_map = {question.id: question for question in submission.quiz.questions.all()}

        for answer_item in submission.answers or []:
            if not isinstance(answer_item, dict):
                continue

            question = question_map.get(answer_item.get('question_id'))
            if not question or not question.allow_peer_upvoting:
                continue

            question_type = normalize_question_type(question.question_type)
            if question_type not in SHORT_TEXT_TYPES:
                continue

            response_text = extract_textual_answer(answer_item.get('answer'))
            if not response_text:
                continue

            peer_response, created = PeerResponse.objects.get_or_create(
                quiz=submission.quiz,
                question=question,
                student_name=submission.student_name,
                defaults={'response_text': response_text},
            )

            if not created and peer_response.response_text != response_text:
                peer_response.response_text = response_text
                peer_response.upvote_count = 0
                peer_response.upvoted_by = []
                peer_response.save(update_fields=['response_text', 'upvote_count', 'upvoted_by'])

    def grade_submission(self, submission):
        quiz = submission.quiz
        questions = {q.id: q for q in quiz.questions.all()}
        gradable_question_ids = [
            question_id
            for question_id, question in questions.items()
            if normalize_question_type(question.question_type) in {'Multiple Choice', 'True/False', 'Matching', 'Essay', 'Fill In the Blank'}
        ]
        score = 0
        total_possible = len(gradable_question_ids)

        for answer_item in submission.answers or []:
            if not isinstance(answer_item, dict):
                continue

            question_id = answer_item.get('question_id')
            question = questions.get(question_id)
            if not question:
                continue

            answer_value = answer_item.get('answer')
            question_type = normalize_question_type(question.question_type)
            interaction = question.interaction_data or {}

            if question_type == 'Multiple Choice':
                choices = normalize_choice_list(interaction.get('options'))
                correct_index = interaction.get('correct_index')
                if correct_index is None:
                    correct_index = interaction.get('correct_option')
                if correct_index is None:
                    correct_index = 0

                resolved_correct_index = find_choice_index(correct_index, choices)
                if resolved_correct_index is None:
                    try:
                        numeric_correct_index = int(correct_index)
                        if 0 <= numeric_correct_index < len(choices):
                            resolved_correct_index = numeric_correct_index
                    except (TypeError, ValueError):
                        resolved_correct_index = None

                selected_index = find_choice_index(answer_value, choices)
                if selected_index is not None and resolved_correct_index is not None and selected_index == resolved_correct_index:
                    score += 1
            elif question_type == 'True/False':
                choices = normalize_choice_list(interaction.get('options'), default_true_false=True)
                correct_index = interaction.get('correct_index')
                if correct_index is None:
                    correct_index = interaction.get('correct_option')
                if correct_index is None:
                    correct_index = 0

                resolved_correct_index = find_choice_index(correct_index, choices)
                if resolved_correct_index is None:
                    try:
                        numeric_correct_index = int(correct_index)
                        if 0 <= numeric_correct_index < len(choices):
                            resolved_correct_index = numeric_correct_index
                    except (TypeError, ValueError):
                        resolved_correct_index = None

                selected_index = find_choice_index(answer_value, choices)

                if selected_index is None and isinstance(answer_value, bool):
                    selected_index = 0 if answer_value else 1

                if selected_index is not None and resolved_correct_index is not None and selected_index == resolved_correct_index:
                    score += 1
            elif question_type in ['Fill In the Blank']:
                if answer_value is not None and str(answer_value).strip() != '':
                    score += 1
            elif question_type in ['Essay']:
                if answer_value is not None and str(answer_value).strip() != '':
                    score += 1
            elif question_type == 'Matching':
                left_items = normalize_matching_items(interaction.get('left_items'), prefix='L')
                right_options = normalize_matching_items(interaction.get('right_options'), prefix='R')
                correct_mapping = normalize_correct_mapping(
                    interaction.get('correct_mapping'),
                    left_items,
                    right_options,
                )
                submitted_mapping = normalize_matching_answer(answer_value, left_items, right_options)

                left_ids = [str((item or {}).get('id') or '').strip() for item in left_items if str((item or {}).get('id') or '').strip()]
                if left_ids and all(submitted_mapping.get(left_id) == correct_mapping.get(left_id) for left_id in left_ids):
                    score += 1

        submission.score = score
        submission.total_possible = total_possible
        submission.save(update_fields=['score', 'total_possible'])
