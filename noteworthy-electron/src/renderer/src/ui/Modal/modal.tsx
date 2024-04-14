import { NoteworthyExtensionApi } from "@common/extensions/extension-api";
import { Ref, Show, createEffect } from "solid-js";

import "./modal.css"
import { CommandSpec } from "@common/commands/commands";

export interface ModalActions {
	close: () => Promise<void>;
}

/* ---- modal component --------------------------------- */

type RenderModalFn = (dom : HTMLElement, actions: ModalActions) => void;

export interface ModalProps {
	setModalState: (setter: (state: ModalState) => ModalState) => void,
	data: null | {
		renderModal: RenderModalFn,
		title: string,
	},
}

export const Modal = (props: ModalProps) => {
	let contentRef: Ref<HTMLElement>;
	const actions: ModalActions = {
		async close() {
			props.setModalState(state => {
				return ModalController.hideModal(state);
			});
		}
	}

	const handleClickBackground = (evt: MouseEvent) => {
		if(evt.target !== evt.currentTarget) return;
		actions.close();
	}

	return (<Show when={props.data !== null}>
		<div class="modal" onClick={handleClickBackground}>
			<div class="modal-box">
				<div class="modal-title">{props.data!.title}</div>
				<div ref={dom => props.data!.renderModal(dom, actions)} class="modal-content" />
			</div>
		</div>
	</Show>);
}

/* ---- modal controller -------------------------------- */

export interface ModalState {
	data: null | {
		title: string,
		renderModal: RenderModalFn,
	}
}

export const initialModalState: ModalState = {
	data: null
}

export interface ModalController {
	showModal(state: ModalState): ModalState;
	hideModal(state: ModalState): ModalState;
	computeProps(state: ModalState): ModalProps;
}

export namespace ModalController {
	export const showModal = (
		state: ModalState,
		data: {
			title: string,
			renderModal: RenderModalFn,
		}
	): ModalState => {
		return {
			...state,
			data: {
				title: data.title,
				renderModal: data.renderModal
			}
		}
	};

	export const hideModal = (state: ModalState): ModalState => {
		return {
			...state,
			data: null
		}
	};

	export const computeProps = (state: ModalState): Omit<ModalProps, "setModalState"> => {
		return {
			data: state.data
		};
	};
}

/* ---- modal comands ----------------------------------- */

declare module "@common/extensions/noteworthy-extension" {
  export interface CommunityExtensionCommands {
    showModal: CommandSpec<
			{
				title: string,
				renderModal: RenderModalFn,
			},
			void
		>,
		hideModal: CommandSpec<{}, void>
  }
}

export const initModalCommands = (
	setModalState: (setter: (state: ModalState) => ModalState) => void,
	api: NoteworthyExtensionApi
): void => {
	api.registerCommand("showModal", async (args) => {
		setModalState((state: ModalState) =>
			ModalController.showModal(state, args)
		);
	});

	api.registerCommand("hideModal", async () => {
		setModalState((state: ModalState) =>
			ModalController.hideModal(state)
		);
	});
}
