from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class TestFixture(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str
    command: str
    expected_status_code: int
    expected_fields: List[str]
    tags: List[str]
    before_test: Optional[str] = None
    after_test: Optional[str] = None
    expected_min_results: Optional[int] = None
