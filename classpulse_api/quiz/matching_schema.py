def _index_to_id(prefix, index):
    return f"{prefix}{index + 1}"


def normalize_matching_items(raw_items, prefix):
    items = raw_items if isinstance(raw_items, list) else []
    normalized = []

    for index, raw_item in enumerate(items):
        default_id = _index_to_id(prefix, index)

        if isinstance(raw_item, dict):
            item_id = str(raw_item.get('id') or '').strip() or default_id
            item_text = str(raw_item.get('text') or '').strip()
            image_url = raw_item.get('image_url')
            image_url = str(image_url).strip() if image_url else None
        else:
            item_id = default_id
            item_text = str(raw_item or '').strip()
            image_url = None

        normalized.append({
            'id': item_id,
            'text': item_text,
            'image_url': image_url,
        })

    seen = set()
    for index, item in enumerate(normalized):
        item_id = str(item.get('id') or '').strip() or _index_to_id(prefix, index)
        if item_id in seen:
            item_id = _index_to_id(prefix, index)
        item['id'] = item_id
        seen.add(item_id)

    return normalized


def _build_right_lookup(right_options):
    lookup_by_id = {}
    lookup_by_text = {}

    for index, option in enumerate(right_options or []):
        option_id = str((option or {}).get('id') or '').strip()
        option_text = str((option or {}).get('text') or '').strip()

        if option_id:
            lookup_by_id[option_id.lower()] = option_id

        if option_text:
            lookup_by_text[option_text] = option_id or _index_to_id('R', index)

    return lookup_by_id, lookup_by_text


def resolve_right_option_id(raw_value, right_options):
    if not isinstance(right_options, list) or not right_options:
        return None

    lookup_by_id, lookup_by_text = _build_right_lookup(right_options)

    if isinstance(raw_value, (int, float)):
        index = int(raw_value)
        if 0 <= index < len(right_options):
            option_id = str((right_options[index] or {}).get('id') or '').strip()
            return option_id or _index_to_id('R', index)
        return None

    if isinstance(raw_value, dict):
        candidate_id = str(raw_value.get('id') or '').strip()
        if candidate_id and candidate_id.lower() in lookup_by_id:
            return lookup_by_id[candidate_id.lower()]

        candidate_text = str(raw_value.get('text') or '').strip()
        if candidate_text and candidate_text in lookup_by_text:
            return lookup_by_text[candidate_text]

        return None

    raw_text = str(raw_value or '').strip()
    if not raw_text:
        return None

    if raw_text.lower() in lookup_by_id:
        return lookup_by_id[raw_text.lower()]

    if raw_text in lookup_by_text:
        return lookup_by_text[raw_text]

    if raw_text.isdigit():
        index = int(raw_text)
        if 0 <= index < len(right_options):
            option_id = str((right_options[index] or {}).get('id') or '').strip()
            return option_id or _index_to_id('R', index)

    return None


def normalize_correct_mapping(raw_mapping, left_items, right_options):
    mapping = raw_mapping if isinstance(raw_mapping, dict) else {}
    normalized = {}

    for left_item in left_items or []:
        left_id = str((left_item or {}).get('id') or '').strip()
        if not left_id:
            continue

        resolved = resolve_right_option_id(mapping.get(left_id), right_options)
        normalized[left_id] = resolved

    return normalized


def normalize_matching_answer(answer_value, left_items, right_options):
    mapping = answer_value if isinstance(answer_value, dict) else {}
    normalized = {}

    for left_item in left_items or []:
        left_id = str((left_item or {}).get('id') or '').strip()
        if not left_id:
            continue

        resolved = resolve_right_option_id(mapping.get(left_id), right_options)
        if resolved:
            normalized[left_id] = resolved

    return normalized
