"""Sanity tests for field-mapping safety nets (no live OpenAI calls here).
Run with: pytest backend/tests -v
"""

from schemas.field_schema import FieldMapping, FieldDescriptor


def test_option_validation_logic():
    field = FieldDescriptor(selectorId="f1", label="Country", type="select", options=["India", "USA"])
    mapping = FieldMapping(selectorId="f1", value="Narnia", confidence=0.9, reasoning="guessed")

    # Simulate the same validation the service applies
    if field.options and mapping.value not in field.options:
        mapping.value = None
        mapping.confidence = 0.0

    assert mapping.value is None
    assert mapping.confidence == 0.0


def test_field_mapping_types():
    # Verify FieldMapping accepts list, bool, and int
    m_list = FieldMapping(selectorId="f2", value=["Python", "React"], confidence=0.95)
    assert m_list.value == ["Python", "React"]

    m_bool = FieldMapping(selectorId="f3", value=True, confidence=1.0)
    assert m_bool.value is True

    m_str = FieldMapping(selectorId="f4", value="01/2024", confidence=0.9)
    assert m_str.value == "01/2024"
