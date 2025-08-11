/**
 * Manages the application's state, including persistence to localStorage.
 */
export class StateManager {
    constructor(initialState) {
        this.state = this.loadState() || initialState;
    }

    /**
     * Retrieves the current state.
     * @returns {object} The current state.
     */
    getState() {
        return this.state;
    }

    /**
     * Updates the state with new values and persists it.
     * @param {object} newState - An object with the new state values to merge.
     */
    updateState(newState) {
        this.state = { ...this.state, ...newState };
        this.saveState();
    }

    /**
     * Saves the current state to localStorage.
     */
    saveState() {
        try {
            const stateToSave = {
                ...this.state,
                selectedDates: Array.from(this.state.selectedDates) // Convert Set to Array for JSON serialization
            };
            localStorage.setItem('planificadorAppData', JSON.stringify(stateToSave));
        } catch (error) {
            console.error('Error saving state to local storage:', error);
        }
    }

    /**
     * Loads the state from localStorage.
     * @returns {object|null} The loaded state or null if not found or invalid.
     */
    loadState() {
        try {
            const serializedState = localStorage.getItem('planificadorAppData');
            if (serializedState === null) return null;
            const loadedState = JSON.parse(serializedState);
            loadedState.selectedDates = new Set(loadedState.selectedDates || []);
            return loadedState;
        } catch (error) {
            console.error('Error loading state from local storage:', error);
            return null;
        }
    }

    /**
     * Clears the persisted state from localStorage.
     */
    clearState() {
        localStorage.removeItem('planificadorAppData');
    }
}