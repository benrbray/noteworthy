import { NoteworthyExtensionApi } from "@common/extensions/extension-api";
import { Show, createEffect } from "solid-js";

import "./modal.css"

/* ---- modal component --------------------------------- */

export interface ModalProps {
	title: string,
	visible: boolean
	setModalState: (setter: (state: ModalState) => ModalState) => void
}

export const Modal = (props: ModalProps) =>
	(<Show when={props.visible}>
		<div class="modal">
			<div class="modal-box">
				<div class="modal-title">{props.title}</div>
				<div class="modal-content">
				content
				</div>
				<div class="modal-button-row">
					<button
						class="modal-button"
						onClick={() => props.setModalState(state => ModalController.hideModal(state))}
					>Cancel</button>
					<button class="modal-button">Confirm</button>
				</div>
			</div>
		</div>
	</Show>)

/* ---- modal controller -------------------------------- */

export interface ModalState {
	visible: boolean
}

export const initialModalState: ModalState = {
	visible: false
}

export interface ModalController {
	showModal(state: ModalState): ModalState;
	hideModal(state: ModalState): ModalState;
	computeProps(state: ModalState): ModalProps;
}

export namespace ModalController {
	export const showModal = (state: ModalState): ModalState => {
		return {
			...state,
			visible: true
		}
	};

	export const hideModal = (state: ModalState): ModalState => {
		return {
			...state,
			visible: false
		}
	};

	export const computeProps = (state: ModalState): Omit<ModalProps, "setModalState"> => {
		return {
			title: "Title",
			visible: state.visible
		};
	};
}

/* ---- modal comands ----------------------------------- */

declare module "@common/extensions/noteworthy-extension" {
  export interface CommunityExtensionCommands {
    showModal: {},
		hideModal: {}
  }
}

export const initModalCommands = (
	setModalState: (setter: (state: ModalState) => ModalState) => void,
	api: NoteworthyExtensionApi
): void => {
	api.registerCommand("showModal", async () => {
		setModalState((state: ModalState) =>
			ModalController.showModal(state)
		);
	});

	api.registerCommand("hideModal", async () => {
		setModalState((state: ModalState) =>
			ModalController.hideModal(state)
		);
	});
}
