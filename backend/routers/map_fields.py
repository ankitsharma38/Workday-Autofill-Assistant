from fastapi import APIRouter, HTTPException

from schemas.field_schema import MapFieldsRequest, MapFieldsResponse
from services.field_mapper_ai import map_fields as map_fields_service

router = APIRouter()


@router.post("/map-fields", response_model=MapFieldsResponse)
async def map_fields(payload: MapFieldsRequest):
    try:
        mappings = map_fields_service(payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Field mapping failed: {str(e)}")

    return MapFieldsResponse(mappings=mappings)
