package rooms

import "context"

type Manager interface {
	ListRooms(ctx context.Context) ([]RoomSummary, error)

	CreateRoom(ctx context.Context, actor PlayerRef, req CreateRoomRequest) (*Room, *AppError)
	JoinRoom(ctx context.Context, actor PlayerRef, req JoinRoomRequest) (*Room, *AppError)
	LeaveRoom(ctx context.Context, actor PlayerRef, req LeaveRoomRequest) (*Room, *AppError)

	SetReady(ctx context.Context, actor PlayerRef, req SetReadyRequest) (*Room, *AppError)
	StartGame(ctx context.Context, actor PlayerRef, req StartGameRequest) (*Room, *AppError)
	SetStatus(ctx context.Context, roomID string, status RoomStatus) (*Room, *AppError)

	GetRoom(ctx context.Context, roomID string) (*Room, *AppError)
}
