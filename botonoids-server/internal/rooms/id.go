package rooms

import (
	"fmt"
	"sync/atomic"
	"time"
)

var roomIDCounter uint64

func defaultID() string {
	n := atomic.AddUint64(&roomIDCounter, 1)
	return fmt.Sprintf("room_%d_%d", time.Now().UnixNano(), n)
}
