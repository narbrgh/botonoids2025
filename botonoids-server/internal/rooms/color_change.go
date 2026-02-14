package rooms

type ColorChangeResult int

const (
	ColorChangeSuccessful                 ColorChangeResult = iota
	ColorChangeUnsuccessfulStillDecrement ColorChangeResult = iota
	ColorChangeUnsuccessfulDoNotDecrement ColorChangeResult = iota
)
