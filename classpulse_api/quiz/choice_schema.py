def index_to_choice_id(index_value):
    try:
        index = int(index_value)
    except (TypeError, ValueError):
        return None

    if index < 0:
        return None

    return chr(ord('A') + index)


def _coerce_choice_item(raw_choice, index):
    default_id = index_to_choice_id(index) or str(index + 1)

    if isinstance(raw_choice, dict):
        raw_id = str(raw_choice.get('id') or '').strip() or default_id
        text = str(raw_choice.get('text') or '').strip()
        image_url = raw_choice.get('image_url')
        image_url = str(image_url).strip() if image_url else None
        return {
            'id': raw_id,
            'text': text,
            'image_url': image_url,
        }

    text = str(raw_choice or '').strip()
    return {
        'id': default_id,
        'text': text,
        'image_url': None,
    }


def normalize_choice_list(raw_choices, default_true_false=False):
    options = raw_choices if isinstance(raw_choices, list) else []

    if default_true_false and not options:
        options = [
            {'id': 'A', 'text': 'True', 'image_url': None},
            {'id': 'B', 'text': 'False', 'image_url': None},
        ]

    normalized = [_coerce_choice_item(raw_choice, index) for index, raw_choice in enumerate(options)]

    seen_ids = set()
    for index, choice in enumerate(normalized):
        candidate_id = str(choice.get('id') or '').strip() or (index_to_choice_id(index) or str(index + 1))
        if candidate_id in seen_ids:
            candidate_id = index_to_choice_id(index) or f'choice_{index + 1}'
        choice['id'] = candidate_id
        seen_ids.add(candidate_id)

    return normalized


def build_choice_texts(choice_list):
    return [str((choice or {}).get('text') or '').strip() for choice in (choice_list or [])]


def choice_badge_for_index(choice_list, index):
    if not isinstance(index, int):
        return None

    if index < 0 or index >= len(choice_list or []):
        return None

    choice_id = str((choice_list[index] or {}).get('id') or '').strip()
    if choice_id:
        return choice_id

    return index_to_choice_id(index)


def find_choice_index(answer_value, choice_list):
    choices = choice_list or []
    if not choices:
        return None

    if isinstance(answer_value, (int, float)):
        numeric_index = int(answer_value)
        return numeric_index if 0 <= numeric_index < len(choices) else None

    if isinstance(answer_value, dict):
        answer_id = str(answer_value.get('id') or '').strip()
        answer_text = str(answer_value.get('text') or '').strip()
        if answer_id:
            for index, choice in enumerate(choices):
                if str(choice.get('id') or '').strip().lower() == answer_id.lower():
                    return index
        if answer_text:
            for index, choice in enumerate(choices):
                if str(choice.get('text') or '').strip() == answer_text:
                    return index
        return None

    raw_value = str(answer_value or '').strip()
    if not raw_value:
        return None

    if raw_value.isdigit():
        numeric_index = int(raw_value)
        if 0 <= numeric_index < len(choices):
            return numeric_index

    for index, choice in enumerate(choices):
        if str(choice.get('id') or '').strip().lower() == raw_value.lower():
            return index

    for index, choice in enumerate(choices):
        if str(choice.get('text') or '').strip() == raw_value:
            return index

    return None


def normalize_selected_choice_indices(answer_value, choice_list):
    if not isinstance(answer_value, list):
        resolved = find_choice_index(answer_value, choice_list)
        return [resolved] if isinstance(resolved, int) else []

    indices = []
    for item in answer_value:
        resolved = find_choice_index(item, choice_list)
        if isinstance(resolved, int) and resolved not in indices:
            indices.append(resolved)

    return indices
