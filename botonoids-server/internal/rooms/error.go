package rooms

type ErrCode string

const (
	ErrRoomNotFound   ErrCode = "ROOM_NOT_FOUND"
	ErrRoomFull       ErrCode = "ROOM_FULL"
	ErrRoomInGame     ErrCode = "ROOM_IN_GAME"
	ErrAlreadyInRoom  ErrCode = "ALREADY_IN_ROOM"
	ErrNotInRoom      ErrCode = "NOT_IN_ROOM"
	ErrNotHost        ErrCode = "NOT_HOST"
	ErrInvalidName    ErrCode = "INVALID_NAME"
	ErrInvalidRequest ErrCode = "INVALID_REQUEST"
)

type AppError struct {
	Code    ErrCode `json:"code"`
	Message string  `json:"message"`
}
